"""Claude SDK LLM backend (Backend A) — primary backend for analysis tasks.

Dual-mode:
  - Chat mode: ``anthropic`` SDK for plan generation, insights, chart interpretation
  - Agent mode: ``claude-agent-sdk`` for code execution, file analysis, complex reasoning
"""

from __future__ import annotations

import asyncio
import logging
import os
from typing import AsyncGenerator, AsyncIterator, Any

import anthropic

from app.config import settings
from app.llm.base import LLMBackend

logger = logging.getLogger(__name__)

# Lazy availability check for claude-agent-sdk
_agent_sdk_available: bool | None = None


def _check_agent_sdk() -> bool:
    global _agent_sdk_available
    if _agent_sdk_available is None:
        try:
            import claude_agent_sdk  # noqa: F401
            _agent_sdk_available = True
        except ImportError:
            _agent_sdk_available = False
            logger.info("claude-agent-sdk not installed — agent mode unavailable")
    return _agent_sdk_available


class ClaudeBackend(LLMBackend):
    """Claude SDK backend using the Anthropic Python SDK.

    Supports Chat mode (anthropic SDK) and Agent mode (claude-agent-sdk).
    """

    def __init__(
        self,
        api_key: str | None = None,
        model: str | None = None,
        max_tokens: int | None = None,
    ):
        key = api_key or settings.claude_api_key
        if not key:
            raise ValueError("Claude API key or OAuth token is required")

        self._api_key = key
        self.client = anthropic.AsyncAnthropic(api_key=key)
        self._model = model or settings.claude_model
        self._max_tokens = max_tokens or settings.claude_max_tokens

    def get_model(self) -> str:
        return self._model

    def set_model(self, model: str) -> None:
        self._model = model

    def _convert_messages(self, messages: list[dict]) -> tuple[str | None, list[dict]]:
        """Convert OpenAI-style messages to Anthropic format.

        Returns (system_prompt, messages).
        Anthropic expects system as a top-level param, not in messages.
        """
        system = None
        converted = []

        for msg in messages:
            role = msg.get("role", "user")
            content = msg.get("content", "")

            if role == "system":
                system = content
            elif role == "assistant":
                converted.append({"role": "assistant", "content": content})
            elif role == "tool":
                converted.append({
                    "role": "user",
                    "content": [
                        {
                            "type": "tool_result",
                            "tool_use_id": msg.get("tool_call_id", ""),
                            "content": content,
                        }
                    ],
                })
            else:
                converted.append({"role": "user", "content": content})

        return system, converted

    def _convert_tools(self, tools: list[dict] | None) -> list[dict] | None:
        """Convert OpenAI-style tool definitions to Anthropic format."""
        if not tools:
            return None

        anthropic_tools = []
        for tool in tools:
            if tool.get("type") == "function":
                fn = tool["function"]
                anthropic_tools.append({
                    "name": fn["name"],
                    "description": fn.get("description", ""),
                    "input_schema": fn.get("parameters", {"type": "object", "properties": {}}),
                })
            else:
                anthropic_tools.append(tool)

        return anthropic_tools

    async def chat(
        self,
        messages: list[dict],
        tools: list[dict] | None = None,
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> dict[str, Any]:
        system, converted = self._convert_messages(messages)
        anthropic_tools = self._convert_tools(tools)

        kwargs: dict[str, Any] = {
            "model": self._model,
            "messages": converted,
            "max_tokens": max_tokens or self._max_tokens,
        }
        if system:
            kwargs["system"] = system
        if temperature is not None:
            kwargs["temperature"] = temperature
        if anthropic_tools:
            kwargs["tools"] = anthropic_tools

        last_error = None
        for attempt in range(3):
            try:
                response = await self.client.messages.create(**kwargs)
                break
            except Exception as e:
                last_error = e
                if attempt < 2:
                    logger.warning(f"Claude API call failed (attempt {attempt + 1}/3): {e}")
                    await asyncio.sleep(1)
        else:
            raise last_error

        # Extract text and tool_use blocks
        text_parts = []
        tool_calls = []

        for block in response.content:
            if block.type == "text":
                text_parts.append(block.text)
            elif block.type == "tool_use":
                tool_calls.append({
                    "id": block.id,
                    "type": "function",
                    "function": {
                        "name": block.name,
                        "arguments": (
                            block.input
                            if isinstance(block.input, str)
                            else __import__("json").dumps(block.input)
                        ),
                    },
                })

        result: dict[str, Any] = {
            "content": "".join(text_parts),
            "finish_reason": response.stop_reason or "stop",
            "usage": {
                "prompt_tokens": response.usage.input_tokens,
                "completion_tokens": response.usage.output_tokens,
                "total_tokens": response.usage.input_tokens + response.usage.output_tokens,
            },
        }

        if tool_calls:
            result["tool_calls"] = tool_calls

        return result

    async def generate_json(
        self,
        messages: list[dict],
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> dict:
        """Request a JSON response from Claude."""
        import json as _json
        result = await self.chat(messages, temperature=temperature, max_tokens=max_tokens)
        text = result.get("content", "")
        # Extract JSON from markdown code blocks if present
        if "```json" in text:
            text = text.split("```json")[1].split("```")[0].strip()
        elif "```" in text:
            text = text.split("```")[1].split("```")[0].strip()
        try:
            return _json.loads(text)
        except _json.JSONDecodeError:
            return {"raw": result.get("content", ""), "parse_error": True}

    async def stream_chat(
        self,
        messages: list[dict],
        tools: list[dict] | None = None,
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> AsyncGenerator[dict, None]:
        system, converted = self._convert_messages(messages)
        anthropic_tools = self._convert_tools(tools)

        kwargs: dict[str, Any] = {
            "model": self._model,
            "messages": converted,
            "max_tokens": max_tokens or self._max_tokens,
        }
        if system:
            kwargs["system"] = system
        if temperature is not None:
            kwargs["temperature"] = temperature
        if anthropic_tools:
            kwargs["tools"] = anthropic_tools

        last_error = None
        for attempt in range(3):
            try:
                stream_ctx = self.client.messages.stream(**kwargs)
                break
            except Exception as e:
                last_error = e
                if attempt < 2:
                    logger.warning(f"Claude stream init failed (attempt {attempt + 1}/3): {e}")
                    await asyncio.sleep(1)
        else:
            raise last_error

        async with stream_ctx as stream:
            current_tool: dict | None = None

            async for event in stream:
                if event.type == "content_block_start":
                    block = event.content_block
                    if block.type == "tool_use":
                        current_tool = {
                            "id": block.id,
                            "type": "function",
                            "function": {
                                "name": block.name,
                                "arguments": "",
                            },
                        }

                elif event.type == "content_block_delta":
                    delta = event.delta
                    if delta.type == "text_delta":
                        yield {"type": "text", "content": delta.text}
                    elif delta.type == "input_json_delta" and current_tool:
                        current_tool["function"]["arguments"] += delta.partial_json

                elif event.type == "content_block_stop":
                    if current_tool:
                        yield {"type": "tool_call", "toolCall": current_tool}
                        current_tool = None

                elif event.type == "message_stop":
                    yield {"type": "done"}

    # ── Agent mode ───────────────────────────────────────

    @property
    def supports_agent_mode(self) -> bool:
        """Check if claude-agent-sdk is available."""
        return _check_agent_sdk()

    async def agent_query(
        self,
        prompt: str,
        system_prompt: str | None = None,
        allowed_tools: list[str] | None = None,
        max_turns: int = 20,
        cwd: str | None = None,
    ) -> AsyncIterator[dict]:
        """Agent mode: full agent loop with tool calling and code execution.

        Uses claude-agent-sdk which bundles Claude Code CLI.
        Intended for Step 16 code execution, file analysis, complex reasoning chains.
        """
        if not _check_agent_sdk():
            raise RuntimeError("claude-agent-sdk is not installed")

        from claude_agent_sdk import query as sdk_query, ClaudeAgentOptions

        # Ensure the SDK can authenticate
        os.environ.setdefault("ANTHROPIC_API_KEY", self._api_key)

        options = ClaudeAgentOptions(
            allowed_tools=allowed_tools or ["Read", "Write", "Edit", "Bash"],
            system_prompt=system_prompt or "",
            max_turns=max_turns,
            cwd=cwd or os.getcwd(),
        )

        for message in sdk_query(prompt=prompt, options=options):
            msg_type = type(message).__name__

            if msg_type == "AssistantMessage":
                yield {
                    "type": "assistant",
                    "content": getattr(message, "content", str(message)),
                }
            elif msg_type == "ResultMessage":
                yield {
                    "type": "result",
                    "content": getattr(message, "content", str(message)),
                    "subtype": getattr(message, "subtype", None),
                }
            elif msg_type == "SystemMessage":
                yield {
                    "type": "system",
                    "content": getattr(message, "content", str(message)),
                }
            else:
                yield {
                    "type": "unknown",
                    "raw_type": msg_type,
                    "content": str(message),
                }

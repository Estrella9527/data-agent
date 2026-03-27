"""OpenAI-compatible LLM backend."""

from __future__ import annotations

import asyncio
import logging
from typing import AsyncGenerator, Any

from openai import AsyncOpenAI

from app.config import settings
from app.llm.base import LLMBackend

logger = logging.getLogger(__name__)


class GenericBackend(LLMBackend):
    """OpenAI-compatible backend supporting Qwen, DeepSeek, GPT, Ollama, etc."""

    def __init__(
        self,
        api_key: str | None = None,
        base_url: str | None = None,
        model: str | None = None,
    ):
        self.client = AsyncOpenAI(
            api_key=api_key or settings.llm_api_key,
            base_url=base_url or settings.llm_base_url,
            timeout=120.0,  # 120s per-request timeout
        )
        self._model = model or settings.llm_model

    def get_model(self) -> str:
        return self._model

    def set_model(self, model: str) -> None:
        self._model = model

    async def chat(
        self,
        messages: list[dict],
        tools: list[dict] | None = None,
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> dict[str, Any]:
        kwargs: dict[str, Any] = {
            "model": self._model,
            "messages": messages,
            "temperature": temperature if temperature is not None else settings.llm_temperature,
            "max_tokens": max_tokens or settings.llm_max_tokens,
        }
        if tools:
            kwargs["tools"] = tools
            kwargs["tool_choice"] = "auto"

        last_error = None
        for attempt in range(3):
            try:
                response = await self.client.chat.completions.create(**kwargs)
                break
            except Exception as e:
                last_error = e
                if attempt < 2:
                    logger.warning(f"LLM API call failed (attempt {attempt + 1}/3): {e}")
                    await asyncio.sleep(1)
        else:
            raise last_error
        choice = response.choices[0]

        result: dict[str, Any] = {
            "content": choice.message.content or "",
            "finish_reason": choice.finish_reason,
            "usage": {
                "prompt_tokens": response.usage.prompt_tokens,
                "completion_tokens": response.usage.completion_tokens,
                "total_tokens": response.usage.total_tokens,
            } if response.usage else {},
        }

        if choice.message.tool_calls:
            result["tool_calls"] = [
                {
                    "id": tc.id,
                    "type": tc.type,
                    "function": {
                        "name": tc.function.name,
                        "arguments": tc.function.arguments,
                    },
                }
                for tc in choice.message.tool_calls
            ]

        return result

    async def generate_json(
        self,
        messages: list[dict],
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> dict:
        """Request a JSON response from the OpenAI-compatible API."""
        import json as _json
        kwargs: dict[str, Any] = {
            "model": self._model,
            "messages": messages,
            "temperature": temperature if temperature is not None else 0.3,
            "max_tokens": max_tokens or settings.llm_max_tokens,
        }
        # Try response_format if supported
        try:
            kwargs["response_format"] = {"type": "json_object"}
            response = await self.client.chat.completions.create(**kwargs)
        except Exception:
            del kwargs["response_format"]
            response = await self.client.chat.completions.create(**kwargs)

        text = response.choices[0].message.content or ""
        if "```json" in text:
            text = text.split("```json")[1].split("```")[0].strip()
        elif "```" in text:
            text = text.split("```")[1].split("```")[0].strip()
        try:
            return _json.loads(text)
        except _json.JSONDecodeError:
            return {"raw": response.choices[0].message.content or "", "parse_error": True}

    async def stream_chat(
        self,
        messages: list[dict],
        tools: list[dict] | None = None,
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> AsyncGenerator[dict, None]:
        kwargs: dict[str, Any] = {
            "model": self._model,
            "messages": messages,
            "temperature": temperature if temperature is not None else settings.llm_temperature,
            "max_tokens": max_tokens or settings.llm_max_tokens,
            "stream": True,
        }
        if tools:
            kwargs["tools"] = tools
            kwargs["tool_choice"] = "auto"

        last_error = None
        for attempt in range(3):
            try:
                stream = await self.client.chat.completions.create(**kwargs)
                break
            except Exception as e:
                last_error = e
                if attempt < 2:
                    logger.warning(f"LLM stream call failed (attempt {attempt + 1}/3): {e}")
                    await asyncio.sleep(1)
        else:
            raise last_error
        tool_calls_buffer: dict[int, dict] = {}

        async for chunk in stream:
            delta = chunk.choices[0].delta if chunk.choices else None
            finish_reason = chunk.choices[0].finish_reason if chunk.choices else None

            if delta:
                if delta.content:
                    yield {"type": "text", "content": delta.content}

                if delta.tool_calls:
                    for tc in delta.tool_calls:
                        if tc.index not in tool_calls_buffer:
                            tool_calls_buffer[tc.index] = {
                                "id": tc.id or "",
                                "type": "function",
                                "function": {"name": "", "arguments": ""},
                            }
                        if tc.id:
                            tool_calls_buffer[tc.index]["id"] = tc.id
                        if tc.function:
                            if tc.function.name:
                                tool_calls_buffer[tc.index]["function"]["name"] = tc.function.name
                            if tc.function.arguments:
                                tool_calls_buffer[tc.index]["function"]["arguments"] += tc.function.arguments

            if finish_reason == "tool_calls":
                for tc in tool_calls_buffer.values():
                    yield {"type": "tool_call", "toolCall": tc}

            if finish_reason == "stop":
                yield {"type": "done"}

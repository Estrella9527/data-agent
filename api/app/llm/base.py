"""LLM backend abstract base."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import AsyncGenerator, AsyncIterator, Any


class LLMBackend(ABC):
    """Abstract base class for LLM backends."""

    @abstractmethod
    async def chat(
        self,
        messages: list[dict],
        tools: list[dict] | None = None,
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> dict[str, Any]:
        ...

    @abstractmethod
    async def stream_chat(
        self,
        messages: list[dict],
        tools: list[dict] | None = None,
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> AsyncGenerator[dict, None]:
        ...

    @abstractmethod
    async def generate_json(
        self,
        messages: list[dict],
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> dict:
        """Request a JSON-formatted response (for plans, routing, etc.)."""
        ...

    @abstractmethod
    def get_model(self) -> str:
        ...

    @abstractmethod
    def set_model(self, model: str) -> None:
        ...

    # ── Agent mode (optional) ────────────────────────────

    @property
    def supports_agent_mode(self) -> bool:
        """Whether this backend supports the agent loop (tool use, code exec)."""
        return False

    async def agent_query(
        self,
        prompt: str,
        system_prompt: str | None = None,
        allowed_tools: list[str] | None = None,
        max_turns: int = 20,
        cwd: str | None = None,
    ) -> AsyncIterator[dict]:
        """Agent mode: full agent loop with tool calling and code execution.

        Only available when ``supports_agent_mode`` is True.
        """
        raise NotImplementedError("This backend does not support agent mode")
        # Make this an async generator
        yield  # type: ignore[misc]  # pragma: no cover

"""LLM Router — dual-backend task-based routing per PRD §2.2.

Backend A: Claude SDK (primary) — plan, code, reflect, insight, chart, profile, mode_route
Backend B: Generic OpenAI-compatible (auxiliary) — title_gen, fallback
"""

from __future__ import annotations

import logging
from typing import Literal

from app.config import settings
from app.llm.base import LLMBackend
from app.llm.generic_backend import GenericBackend

logger = logging.getLogger(__name__)

TaskType = Literal[
    "planner",
    "code_gen",
    "reflector",
    "insight",
    "chart_interpret",
    "data_profile",
    "title_gen",
    "mode_route",
    "default",
]

# PRD §2.2 routing table
ROUTE_TABLE: dict[TaskType, dict] = {
    "planner":         {"backend": "claude", "model_tier": "sonnet"},
    "code_gen":        {"backend": "claude", "model_tier": "sonnet"},
    "reflector":       {"backend": "claude", "model_tier": "haiku"},
    "insight":         {"backend": "claude", "model_tier": "sonnet"},
    "chart_interpret": {"backend": "claude", "model_tier": "haiku"},
    "data_profile":    {"backend": "claude", "model_tier": "haiku"},
    "title_gen":       {"backend": "generic", "model_tier": "default"},
    "mode_route":      {"backend": "claude", "model_tier": "haiku"},
    "default":         {"backend": "claude", "model_tier": "sonnet"},
}


class LLMRouter:
    """Routes pipeline tasks to the appropriate LLM backend + model."""

    def __init__(self):
        self._claude_backend: LLMBackend | None = None
        self._claude_haiku_backend: LLMBackend | None = None
        self._generic_backend: LLMBackend | None = None
        self._init_backends()

    def _init_backends(self) -> None:
        """Initialize backends from settings. Lazy — only if keys are configured."""
        # Backend A: Claude SDK
        if settings.claude_api_key:
            try:
                from app.llm.claude_backend import ClaudeBackend

                self._claude_backend = ClaudeBackend(
                    api_key=settings.claude_api_key,
                    model=settings.claude_model,
                )
                self._claude_haiku_backend = ClaudeBackend(
                    api_key=settings.claude_api_key,
                    model=settings.claude_haiku_model,
                )
                logger.info("Claude SDK backend initialized (sonnet + haiku)")
            except Exception as e:
                logger.warning(f"Failed to init Claude backend: {e}")

        # Backend B: Generic OpenAI-compatible
        if settings.llm_api_key:
            try:
                self._generic_backend = GenericBackend(
                    api_key=settings.llm_api_key,
                    base_url=settings.llm_base_url,
                    model=settings.llm_model,
                )
                logger.info(f"Generic backend initialized ({settings.llm_model})")
            except Exception as e:
                logger.warning(f"Failed to init generic backend: {e}")

    def get_backend(self, task: TaskType = "default") -> LLMBackend:
        """Get the appropriate backend for the given task type."""
        route = ROUTE_TABLE.get(task, ROUTE_TABLE["default"])
        backend_type = route["backend"]
        model_tier = route["model_tier"]

        # Try primary backend first
        if backend_type == "claude":
            backend = (
                self._claude_haiku_backend
                if model_tier == "haiku"
                else self._claude_backend
            )
            if backend:
                return backend
            # Fallback to generic if claude not configured
            if self._generic_backend:
                logger.info(f"Claude not configured, falling back to generic for {task}")
                return self._generic_backend

        elif backend_type == "generic":
            if self._generic_backend:
                return self._generic_backend
            # Fallback to claude haiku for cheap tasks
            backend = self._claude_haiku_backend or self._claude_backend
            if backend:
                logger.info(f"Generic not configured, falling back to Claude for {task}")
                return backend

        # Last resort — try anything available
        for b in [self._claude_backend, self._claude_haiku_backend, self._generic_backend]:
            if b:
                return b

        raise RuntimeError(
            "No LLM backend available. Configure either CLAUDE_API_KEY or LLM_API_KEY."
        )

    def configure_claude(
        self,
        api_key: str,
        model: str | None = None,
        haiku_model: str | None = None,
    ) -> None:
        """Configure or reconfigure Claude backend at runtime."""
        from app.llm.claude_backend import ClaudeBackend

        self._claude_backend = ClaudeBackend(
            api_key=api_key,
            model=model or settings.claude_model,
        )
        self._claude_haiku_backend = ClaudeBackend(
            api_key=api_key,
            model=haiku_model or settings.claude_haiku_model,
        )
        logger.info("Claude backend reconfigured")

    def configure_generic(
        self,
        api_key: str | None = None,
        base_url: str | None = None,
        model: str | None = None,
    ) -> None:
        """Configure or reconfigure generic backend at runtime."""
        self._generic_backend = GenericBackend(
            api_key=api_key,
            base_url=base_url,
            model=model,
        )
        logger.info(f"Generic backend reconfigured ({model})")

    def get_agent(self) -> LLMBackend:
        """Return a backend that supports agent mode (tool use, code exec).

        Currently only ClaudeBackend supports this. Raises if unavailable.
        """
        if self._claude_backend and self._claude_backend.supports_agent_mode:
            return self._claude_backend
        raise RuntimeError(
            "No agent-capable backend available. "
            "Configure Claude backend and install claude-agent-sdk."
        )

    @property
    def has_claude(self) -> bool:
        return self._claude_backend is not None

    @property
    def has_generic(self) -> bool:
        return self._generic_backend is not None


# Singleton
llm_router = LLMRouter()

"""Sandbox base class — abstract interface for code execution."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass
class SandboxResult:
    success: bool
    stdout: str
    stderr: str
    files: list[str] = field(default_factory=list)
    chart_files: list[str] = field(default_factory=list)
    execution_time_ms: int = 0


class Sandbox(ABC):
    @abstractmethod
    async def run(self, code: str, timeout: int = 120) -> SandboxResult:
        """Execute code and return result."""
        ...

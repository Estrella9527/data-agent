"""SubprocessSandbox — execute Python code in an isolated subprocess."""

from __future__ import annotations

import asyncio
import logging
import os
import shutil
import time
from pathlib import Path

from app.sandbox.base import Sandbox, SandboxResult

logger = logging.getLogger(__name__)

# Base dir for all sandbox executions
SANDBOX_ROOT = Path("/tmp/data_agent")


class SubprocessSandbox(Sandbox):
    """Run Python code in a subprocess with file isolation."""

    def __init__(self, session_id: str, goal_index: int = 0):
        self.session_id = session_id
        self.goal_index = goal_index
        self.work_dir = SANDBOX_ROOT / session_id / f"goal_{goal_index}"

    def provision_data(self, data_paths: list[str]) -> list[str]:
        """Symlink source data files into sandbox data/ directory.

        Returns list of relative paths (e.g. ['data/orders.csv']).
        """
        data_dir = self.work_dir / "data"
        data_dir.mkdir(parents=True, exist_ok=True)

        relative_paths: list[str] = []
        for abs_path in data_paths:
            src = Path(abs_path)
            if not src.exists():
                logger.warning(f"Data file not found, skipping: {abs_path}")
                continue
            dst = data_dir / src.name
            # Remove stale symlink / file if exists
            if dst.exists() or dst.is_symlink():
                dst.unlink()
            dst.symlink_to(src.resolve())
            relative_paths.append(f"data/{src.name}")
        return relative_paths

    async def run(self, code: str, timeout: int = 120) -> SandboxResult:
        # Prepare working directory
        self.work_dir.mkdir(parents=True, exist_ok=True)
        charts_dir = self.work_dir / "charts"
        charts_dir.mkdir(exist_ok=True)

        script_path = self.work_dir / "analysis.py"
        script_path.write_text(code, encoding="utf-8")

        start = time.monotonic()

        try:
            proc = await asyncio.wait_for(
                asyncio.create_subprocess_exec(
                    "python3", str(script_path),
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                    cwd=str(self.work_dir),
                    env={
                        **os.environ,
                        "MPLBACKEND": "Agg",  # Non-interactive matplotlib
                        "PYTHONIOENCODING": "utf-8",
                    },
                ),
                timeout=5,
            )
            stdout_bytes, stderr_bytes = await asyncio.wait_for(
                proc.communicate(),
                timeout=timeout,
            )

            elapsed_ms = int((time.monotonic() - start) * 1000)
            stdout = stdout_bytes.decode("utf-8", errors="replace").strip()
            stderr = stderr_bytes.decode("utf-8", errors="replace").strip()

            # Collect generated chart files
            chart_files = []
            if charts_dir.exists():
                for f in charts_dir.iterdir():
                    if f.suffix.lower() in (".png", ".jpg", ".svg", ".pdf"):
                        chart_files.append(str(f))

            # Collect other generated files
            gen_files = []
            for f in self.work_dir.iterdir():
                if f.name != "analysis.py" and f.is_file():
                    gen_files.append(str(f))

            return SandboxResult(
                success=proc.returncode == 0,
                stdout=stdout,
                stderr=stderr,
                files=gen_files,
                chart_files=chart_files,
                execution_time_ms=elapsed_ms,
            )

        except asyncio.TimeoutError:
            elapsed_ms = int((time.monotonic() - start) * 1000)
            return SandboxResult(
                success=False,
                stdout="",
                stderr=f"执行超时（{timeout}秒限制）",
                execution_time_ms=elapsed_ms,
            )
        except Exception as e:
            elapsed_ms = int((time.monotonic() - start) * 1000)
            return SandboxResult(
                success=False,
                stdout="",
                stderr=str(e),
                execution_time_ms=elapsed_ms,
            )

    def cleanup(self):
        """Remove working directory."""
        if self.work_dir.exists():
            shutil.rmtree(self.work_dir, ignore_errors=True)

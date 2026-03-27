"""QuickExecutor — fast-path for simple questions via code gen + subprocess."""

from __future__ import annotations

import csv
import io
import json
import logging
import re
from typing import AsyncGenerator

from app.llm.router import llm_router
from app.llm.prompt_assembler import PromptAssembler, PromptContext
from app.prompts.code_gen import format_quick_prompt
from app.engine.events import (
    AgentEvent, text_delta, error, error_retry,
    goal_start, code_generated, execution_result, execution_start,
)
from app.engine.code_utils import extract_python_code, validate_python_syntax

logger = logging.getLogger(__name__)
prompt_assembler = PromptAssembler()

EXECUTION_TIMEOUT = 30  # seconds
QUICK_GOAL_ID = "quick"


class QuickExecutor:
    """Execute quick questions: LLM generates Python → subprocess runs it."""

    def __init__(self, session_id: str = "quick"):
        self.session_id = session_id

    async def execute(
        self,
        user_request: str,
        data_profiles: list[dict],
        data_paths: list[str],
    ) -> AsyncGenerator[AgentEvent, None]:
        """Generate and execute code for a quick question."""
        from app.sandbox.subprocess_sandbox import SubprocessSandbox

        # Emit goal_start so frontend renders ExecutionPanel
        yield goal_start(
            goal_id=QUICK_GOAL_ID,
            title="快速查询",
            index=0,
            total=1,
        )

        # Provision sandbox with data files
        sandbox = SubprocessSandbox(self.session_id, goal_index=0)
        sandbox.provision_data(data_paths)

        # Step 1: Generate code
        code = await self._generate_code(user_request, data_profiles, data_paths)
        if not code:
            yield error("无法生成分析代码")
            return

        yield code_generated(
            goal_id=QUICK_GOAL_ID,
            code=code,
            code_type="python",
        )

        # Step 2: Execute in sandbox
        yield execution_start(QUICK_GOAL_ID)
        result = await sandbox.run(code)
        success = result.success
        output = result.stdout if success else result.stderr

        if not success:
            # One retry with error context
            logger.info("Quick execution failed, retrying with error context")
            yield error_retry(goal_id=QUICK_GOAL_ID, error=output[:300], attempt=1, max_attempts=2)
            code = await self._fix_code(code, output, user_request, data_profiles, data_paths)
            if code:
                yield code_generated(
                    goal_id=QUICK_GOAL_ID,
                    code=code,
                    code_type="python",
                    explanation="自动修复后重试",
                )
                result = await sandbox.run(code)
                success = result.success
                output = result.stdout if success else result.stderr

        if success:
            parsed = self._parse_output(output)
            if parsed:
                yield execution_result(
                    goal_id=QUICK_GOAL_ID,
                    columns=parsed["columns"],
                    rows=parsed["rows"],
                    row_count=len(parsed["rows"]),
                )
            else:
                # Plain text result — wrap in a single-cell table for consistency
                yield execution_result(
                    goal_id=QUICK_GOAL_ID,
                    columns=["output"],
                    rows=[{"output": output}],
                    row_count=1,
                )
        else:
            yield error(f"代码执行失败: {output[:500]}")

    async def _generate_code(
        self,
        request: str,
        profiles: list[dict],
        data_paths: list[str],
    ) -> str:
        """Use LLM to generate Python code."""
        user_prompt = format_quick_prompt(request, profiles, data_paths)

        ctx = PromptContext()
        system_prompt = prompt_assembler.assemble(ctx, task="code_gen")

        backend = llm_router.get_backend("code_gen")
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]

        try:
            result = await backend.chat(messages, temperature=0.1, max_tokens=8000)
            content = result.get("content", "")
            code = extract_python_code(content)
            # Validate syntax — return empty on invalid to trigger retry
            if code:
                is_valid, err = validate_python_syntax(code)
                if not is_valid:
                    logger.warning(f"Quick code generation produced invalid syntax: {err}")
                    return ""
            return code
        except Exception as e:
            logger.error(f"Code generation failed: {e}")
            return ""

    async def _fix_code(
        self,
        original_code: str,
        error_msg: str,
        request: str,
        profiles: list[dict],
        data_paths: list[str],
    ) -> str:
        """Ask LLM to fix code based on error."""
        fix_prompt = f"""之前生成的代码执行失败。请修复。

原始代码:
```python
{original_code}
```

错误信息:
{error_msg[:1000]}

用户问题: {request}
数据路径: {data_paths}

请输出修复后的完整 Python 代码。
"""
        ctx = PromptContext()
        system_prompt = prompt_assembler.assemble(ctx, task="code_gen")
        backend = llm_router.get_backend("code_gen")

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": fix_prompt},
        ]

        try:
            result = await backend.chat(messages, temperature=0.1, max_tokens=8000)
            return extract_python_code(result.get("content", ""))
        except Exception:
            return ""

    @staticmethod
    def _parse_output(stdout: str) -> dict | None:
        """Try to parse stdout as structured table data.

        Returns {"columns": [...], "rows": [...]}} or None for plain text.
        """
        if not stdout or stdout == "(无输出)":
            return None

        # Try JSON: list[dict]
        try:
            data = json.loads(stdout)
            if isinstance(data, list) and len(data) > 0 and isinstance(data[0], dict):
                columns = list(data[0].keys())
                return {"columns": columns, "rows": data}
        except (json.JSONDecodeError, TypeError, IndexError):
            pass

        # Try CSV (at least 2 lines, header has ≥2 columns, consistent column count)
        lines = stdout.strip().split("\n")
        if len(lines) >= 2 and "," in lines[0]:
            try:
                reader = csv.DictReader(io.StringIO(stdout))
                rows = list(reader)
                if rows and reader.fieldnames and len(reader.fieldnames) >= 2:
                    # Verify rows have consistent keys matching header
                    header_set = set(reader.fieldnames)
                    if all(set(r.keys()) == header_set for r in rows[:5]):
                        return {"columns": list(reader.fieldnames), "rows": rows}
            except Exception:
                pass

        return None

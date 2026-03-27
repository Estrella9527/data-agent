"""ExecutionEngine — execute confirmed plan goals one by one.

Per-goal loop:
  L2 (strategy): up to 2 attempts
    L1 (code fix): up to 3 attempts
      generate code → sandbox run → check
    reflect → pass or adjust strategy
  extract insight
"""

from __future__ import annotations

import asyncio
import logging
import re
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession

from app.llm.router import llm_router
from app.llm.prompt_assembler import PromptAssembler, PromptContext
from app.sandbox.subprocess_sandbox import SubprocessSandbox
from app.engine.reflector import Reflector
from app.engine.insight_extractor import InsightExtractor
from app.engine.events import (
    AgentEvent,
    goal_start, code_generated, execution_start, execution_result,
    error_retry, reflection_failed, insight, error, text_delta, chart,
    heartbeat,
)
from app.engine.code_utils import extract_python_code, validate_python_syntax

logger = logging.getLogger(__name__)
prompt_assembler = PromptAssembler()

L1_MAX_ATTEMPTS = 3   # Code fix retries
L2_MAX_ATTEMPTS = 2   # Strategy adjustment retries


class ExecutionEngine:
    """Execute a confirmed plan, yielding SSE events per goal."""

    def __init__(
        self,
        session_id: str,
        profiles: list[dict],
        data_paths: list[str],
        db_session: AsyncSession | None = None,
    ):
        self.session_id = session_id
        self.profiles = profiles
        self.data_paths = data_paths
        self.db_session = db_session
        self.reflector = Reflector()
        self.insight_extractor = InsightExtractor()

    async def execute_plan(
        self,
        goals: list[dict],
        plan_id: str = "",
    ) -> AsyncGenerator[AgentEvent, None]:
        """Execute all goals in sequence."""
        total = len(goals)

        for idx, goal in enumerate(goals):
            goal_id = goal.get("id", f"goal_{idx}")
            title = goal.get("title", f"目标 {idx + 1}")
            yield goal_start(goal_id, title, idx, total)
            yield heartbeat()

            success = False
            final_stdout = ""
            final_code = ""

            # L2: strategy-level retries
            strategy_hint = ""
            result = None
            for l2 in range(L2_MAX_ATTEMPTS):
                # L1: code-fix retries
                code = ""
                stdout = ""
                prev_failed_code = ""
                for l1 in range(L1_MAX_ATTEMPTS):
                    # Generate code
                    fix_ctx = strategy_hint if l2 > 0 else ""
                    error_ctx = stdout if l1 > 0 else ""
                    code = await self._generate_code(
                        goal, idx,
                        fix_context=fix_ctx,
                        error_context=error_ctx,
                        failed_code=prev_failed_code if l1 > 0 else "",
                    )
                    if not code:
                        yield error_retry(goal_id, "代码生成失败", l1 + 1, L1_MAX_ATTEMPTS)
                        continue

                    # Validate syntax before sending to sandbox
                    is_valid, syntax_err = validate_python_syntax(code)
                    if not is_valid:
                        prev_failed_code = code
                        stdout = f"SyntaxError: {syntax_err}"
                        if l1 < L1_MAX_ATTEMPTS - 1:
                            yield error_retry(goal_id, f"语法错误: {syntax_err}", l1 + 1, L1_MAX_ATTEMPTS)
                        continue

                    yield code_generated(goal_id, code, "python")
                    yield execution_start(goal_id)

                    # Execute in sandbox — provision data files first
                    sandbox = SubprocessSandbox(self.session_id, idx)
                    sandbox.provision_data(self.data_paths)
                    result = await sandbox.run(code)

                    if result.success:
                        stdout = result.stdout
                        final_code = code
                        break
                    else:
                        stdout = result.stderr
                        prev_failed_code = code
                        if l1 < L1_MAX_ATTEMPTS - 1:
                            yield error_retry(goal_id, stdout[:300], l1 + 1, L1_MAX_ATTEMPTS)

                if result is None or not result.success:
                    yield error(f"目标 '{title}' 代码执行失败: {stdout[:300]}", recoverable=False)
                    break

                # L2: Reflect on result quality
                # Skip reflection for small datasets (<500 rows) — accept directly
                total_rows = sum(p.get("row_count", 0) for p in self.profiles)
                if total_rows < 500:
                    logger.info(f"Skipping reflection for goal {goal_id}: small dataset ({total_rows} rows)")
                    success = True
                    final_stdout = stdout
                    break

                try:
                    profile = self.profiles[0] if self.profiles else None
                    reflection = await asyncio.wait_for(
                        self.reflector.validate(goal, code, stdout, profile),
                        timeout=30.0,
                    )
                except (asyncio.TimeoutError, Exception) as e:
                    logger.warning(f"Reflection failed/timed out for goal {goal_id}: {e}")
                    # Accept result if reflection itself errors or times out
                    success = True
                    final_stdout = stdout
                    break

                if reflection.passed:
                    success = True
                    final_stdout = stdout
                    break
                else:
                    if l2 < L2_MAX_ATTEMPTS - 1:
                        yield reflection_failed(goal_id, reflection.reason)
                        strategy_hint = reflection.fix_instruction
                    else:
                        # Accept result on last attempt even if reflection fails
                        success = True
                        final_stdout = stdout

            # Yield execution result
            chart_urls: list[str] = []
            if success and final_stdout:
                # Parse output into columns/rows if possible, else raw text
                columns, rows, row_count = self._parse_output(final_stdout)
                yield execution_result(goal_id, columns, rows, row_count)

                # Parallel: chart interpretations + insight extraction
                chart_data: list[tuple[str, str]] = []  # [(url, interpretation)]
                insight_text = ""

                if result.chart_files:
                    # Build chart URLs
                    chart_file_urls = []
                    for cf in result.chart_files:
                        rel = cf.replace("/tmp/data_agent/", "")
                        url = f"/api/files/{rel}"
                        chart_urls.append(url)
                        chart_file_urls.append((cf, url))

                    # Run all chart interpretations + insight extraction in parallel
                    chart_tasks = [
                        self._interpret_chart(goal, final_stdout, cf)
                        for cf, _ in chart_file_urls
                    ]
                    insight_task = self.insight_extractor.extract(goal, final_stdout)
                    all_results = await asyncio.gather(
                        *chart_tasks, insight_task, return_exceptions=True,
                    )

                    # Unpack chart results
                    for i, (cf, url) in enumerate(chart_file_urls):
                        interp = all_results[i] if not isinstance(all_results[i], Exception) else ""
                        if isinstance(interp, Exception):
                            logger.warning(f"Chart interpretation failed: {interp}")
                            interp = ""
                        chart_data.append((url, interp))

                    # Unpack insight result
                    insight_result = all_results[-1]
                    if isinstance(insight_result, Exception):
                        logger.warning(f"Insight extraction failed for goal {goal_id}: {insight_result}")
                        insight_text = ""
                    else:
                        insight_text = insight_result or ""
                else:
                    # No charts — just extract insight
                    try:
                        insight_text = await self.insight_extractor.extract(goal, final_stdout)
                    except Exception as e:
                        logger.warning(f"Insight extraction failed for goal {goal_id}: {e}")
                        insight_text = ""

                # Emit chart events
                for url, interpretation in chart_data:
                    yield chart(goal_id, "image", {
                        "url": url,
                        "interpretation": interpretation,
                    })

                # Emit insight event
                if insight_text:
                    yield insight(goal_id, insight_text)

            # Persist execution to DB
            if self.db_session:
                await self._save_execution(
                    plan_id, goal_id, final_code, final_stdout, success,
                    chart_urls=chart_urls,
                )

    async def _interpret_chart(
        self,
        goal: dict,
        stdout: str,
        chart_path: str,
    ) -> str:
        """Generate a 1-2 sentence AI interpretation for a chart."""
        try:
            backend = llm_router.get_backend("chart_interpret")
            title = goal.get("title", "")
            desc = goal.get("description", "")
            # Use stdout tail as context
            stdout_tail = stdout[-1500:] if len(stdout) > 1500 else stdout
            prompt = f"""基于以下分析目标和执行结果，为生成的图表写 1-2 句解读。

## 分析目标
{title}: {desc}

## 执行结果摘要
{stdout_tail}

## 图表文件
{chart_path}

用中文简洁描述图表展示的关键信息和趋势。只输出解读文字，不要前缀。"""
            result = await backend.chat(
                [{"role": "user", "content": prompt}],
                temperature=0.2,
                max_tokens=200,
            )
            return result.get("content", "").strip()
        except Exception as e:
            logger.warning(f"Chart interpretation failed: {e}")
            return ""

    async def _generate_code(
        self,
        goal: dict,
        goal_index: int,
        fix_context: str = "",
        error_context: str = "",
        failed_code: str = "",
    ) -> str:
        """Generate Python code for a goal."""
        from app.prompts.code_gen import format_goal_execution_prompt

        # Build error context with failed code for better retry
        full_error_context = error_context
        if failed_code and error_context:
            full_error_context = (
                f"失败的代码:\n```python\n{failed_code}\n```\n\n"
                f"错误信息:\n{error_context}"
            )

        user_prompt = format_goal_execution_prompt(
            goal=goal,
            profiles=self.profiles,
            data_paths=self.data_paths,
            goal_index=goal_index,
            charts_dir=f"/tmp/data_agent/{self.session_id}/goal_{goal_index}/charts",
            fix_context=fix_context,
            error_context=full_error_context,
        )

        ctx = PromptContext()
        system_prompt = prompt_assembler.assemble(ctx, task="code_gen")
        backend = llm_router.get_backend("code_gen")

        try:
            result = await backend.chat(
                [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.1,
                max_tokens=8000,
            )
            return extract_python_code(result.get("content", ""))
        except Exception as e:
            logger.error(f"Code generation failed for goal {goal_index}: {e}")
            return ""

    def _parse_output(self, stdout: str) -> tuple[list, list, int]:
        """Try to parse structured output; fall back to raw text."""
        lines = stdout.strip().split("\n")

        # If output looks like a table (has | separators or tab-separated)
        if len(lines) >= 2 and ("\t" in lines[0] or "|" in lines[0]):
            # Attempt simple TSV parse
            sep = "\t" if "\t" in lines[0] else "|"
            columns = [c.strip() for c in lines[0].split(sep) if c.strip()]
            rows = []
            for line in lines[1:]:
                if line.strip() and not line.startswith("---"):
                    vals = [v.strip() for v in line.split(sep) if v.strip()]
                    if vals:
                        row = dict(zip(columns, vals))
                        rows.append(row)
            if columns and rows:
                return columns, rows, len(rows)

        # Fallback: single-column raw output
        return ["output"], [{"output": stdout}], 1

    async def _save_execution(
        self,
        plan_id: str,
        goal_id: str,
        code: str,
        stdout: str,
        success: bool,
        chart_urls: list[str] | None = None,
    ) -> None:
        """Persist execution record to DB using ORM."""
        try:
            from app.db.models import ExecutionModel
            from sqlalchemy import select

            exec_id = f"exec_{goal_id}_{plan_id[:8]}"
            result_json = {
                "stdout": stdout[:5000],
                "success": success,
                "charts": chart_urls or [],
            }

            # Check if record already exists
            existing = await self.db_session.execute(
                select(ExecutionModel).where(ExecutionModel.id == exec_id)
            )
            row = existing.scalar_one_or_none()

            if row:
                row.code = code
                row.result = result_json
                row.status = "completed" if success else "failed"
                row.attempts = (row.attempts or 0) + 1
            else:
                self.db_session.add(ExecutionModel(
                    id=exec_id,
                    plan_id=plan_id,
                    goal_id=goal_id,
                    code=code,
                    code_type="python",
                    result=result_json,
                    status="completed" if success else "failed",
                    attempts=1,
                ))

            await self.db_session.commit()
        except Exception as e:
            logger.warning(f"Failed to save execution record: {e}")
            try:
                await self.db_session.rollback()
            except Exception:
                pass


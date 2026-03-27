"""Agent Engine — multi-stage analysis pipeline.

Modes:
  - quick:    mode → profile → code gen → subprocess execute → result
  - standard: mode → profile → plan → clarify? → confirm → execute (Step 16+)
  - deep:     same as standard with deeper exploration

Without data sources, falls back to simple LLM conversation.
"""

from __future__ import annotations

import json
import logging
from typing import AsyncGenerator, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.llm.router import llm_router
from app.llm.prompt_assembler import PromptAssembler, PromptContext
from app.engine.events import (
    AgentEvent, text_delta, error, done,
    mode_info, profiling_start, profile_ready,
    planning_start, plan_ready, clarify_questions,
    plan_updated, plan_confirm_required,
    reporting_start, report_ready,
    title_suggestion, followup_suggestions,
)

logger = logging.getLogger(__name__)
prompt_assembler = PromptAssembler()

VALID_MODES = ("quick", "standard", "deep")


class AgentEngine:
    """Orchestrates a single agent turn with streaming."""

    def __init__(
        self,
        session_id: str,
        data_source_ids: list[str] | None = None,
        table_schemas: list[dict] | None = None,
        history: list[dict] | None = None,
        mode: str | None = None,
        db_session: AsyncSession | None = None,
    ):
        self.session_id = session_id
        self.data_source_ids = data_source_ids or []
        self.table_schemas = table_schemas or []
        self.history = history or []
        self.user_mode = mode  # User-selected mode (overrides LLM routing)
        self.db_session = db_session

        # Pipeline state
        self._mode: str | None = None
        self._profiles: list[dict] = []
        self._plan: dict | None = None
        self._plan_id: str | None = None
        self._conversation_summary: str = ""
        self._previous_results: str = ""

    # ── Mode classification ──────────────────────────────

    async def _classify_mode(self, message: str) -> tuple[str, str]:
        """Determine analysis mode: quick / standard / deep. Returns (mode, reason)."""
        # User manual selection takes priority
        if self.user_mode and self.user_mode in VALID_MODES:
            return self.user_mode, "用户手动选择"

        try:
            backend = llm_router.get_backend("mode_route")
            ctx = PromptContext()

            # Build data context summary for mode routing
            data_context = "无数据源信息"
            if self._profiles:
                parts = []
                for p in self._profiles:
                    name = p.get("source_name", "未知")
                    rc = p.get("row_count", 0)
                    cc = p.get("column_count", 0)
                    col_names = [c.get("name", "") for c in p.get("columns", [])[:15]]
                    parts.append(
                        f"- {name}: {cc} 列, {rc} 行, 字段: {', '.join(col_names)}"
                    )
                data_context = "\n".join(parts) if parts else "无数据源信息"

            if self._previous_results:
                data_context += "\n\n注意：用户已有上一轮分析结果，本轮可能是追问或深挖。简单追问应选quick，深入分析选standard。"

            system_prompt = prompt_assembler.assemble(ctx, task="mode_route")
            # Inject data context into prompt placeholder
            system_prompt = system_prompt.replace("{data_context}", data_context)

            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": message},
            ]
            result = await backend.generate_json(messages, temperature=0.0, max_tokens=200)
            mode = result.get("mode", "standard")
            reason = result.get("reason", "")
            if mode not in VALID_MODES:
                mode = "standard"
            return mode, reason
        except Exception as e:
            logger.warning(f"Mode classification failed, defaulting to standard: {e}")
            return "standard", "分类失败，使用默认模式"

    # ── Previous results loading ────────────────────────

    async def _load_previous_results(self) -> tuple[str, str]:
        """Load previous analysis results for this session from DB.

        Returns (conversation_summary, previous_results).
        """
        if not self.db_session:
            return "", ""

        try:
            from sqlalchemy import select
            from app.db.models import PlanModel, ExecutionModel

            # Get latest completed plan for this session
            stmt = (
                select(PlanModel)
                .where(PlanModel.session_id == self.session_id)
                .where(PlanModel.status == "completed")
                .order_by(PlanModel.created_at.desc())
                .limit(1)
            )
            result = await self.db_session.execute(stmt)
            plan = result.scalar_one_or_none()
            if not plan:
                return "", ""

            parts: list[str] = []

            # Include plan report if available
            conversation_summary = ""
            if plan.report:
                report_md = ""
                if isinstance(plan.report, dict):
                    report_md = plan.report.get("markdown", "")
                elif isinstance(plan.report, str):
                    report_md = plan.report
                if report_md:
                    conversation_summary = report_md[:1000]

            # Load executions for this plan
            exec_stmt = (
                select(ExecutionModel)
                .where(ExecutionModel.plan_id == plan.id)
                .order_by(ExecutionModel.created_at)
            )
            exec_result = await self.db_session.execute(exec_stmt)
            executions = exec_result.scalars().all()

            for ex in executions:
                goal_id = ex.goal_id or ""
                res = ex.result or {}
                insight = res.get("insight", "")
                stdout = res.get("stdout", "")
                # Try to find goal title from plan goals
                goal_title = goal_id
                for g in (plan.goals or []):
                    if g.get("id") == goal_id:
                        goal_title = g.get("title", goal_id)
                        break
                summary_line = f"- {goal_title}"
                if insight:
                    summary_line += f": {insight}"
                elif stdout:
                    summary_line += f": {stdout[:200]}"
                parts.append(summary_line)

            previous_results = "\n".join(parts)
            # Cap total length
            if len(previous_results) > 2000:
                previous_results = previous_results[:2000]

            return conversation_summary, previous_results
        except Exception as e:
            logger.warning(f"Failed to load previous results: {e}")
            return "", ""

    # ── Data profiling ───────────────────────────────────

    async def _load_profiles(self) -> None:
        """Load source profiles into self._profiles (no events)."""
        if self._profiles or not self.data_source_ids or not self.db_session:
            return
        from app.engine.source_loader import load_source_profiles
        self._profiles = await load_source_profiles(
            self.data_source_ids, self.db_session
        )

    def _build_profile_tables(self) -> list[dict]:
        """Build tables payload for profile_ready event (all columns)."""
        tables = []
        for p in self._profiles:
            tables.append({
                "name": p.get("source_name", ""),
                "sourceId": p.get("source_id", ""),
                "rowCount": p.get("row_count", 0),
                "columnCount": p.get("column_count", 0),
                "columns": p.get("columns", []),  # Send all columns; frontend handles display limit
                "qualityIssues": p.get("quality_issues", []),
            })
        return tables

    async def _stage_profile(self) -> AsyncGenerator[AgentEvent, None]:
        """Yield profiling events (profiles should already be loaded)."""
        if not self.data_source_ids or not self.db_session:
            return

        yield profiling_start()

        # Ensure loaded (fallback)
        await self._load_profiles()

        yield profile_ready(self._build_profile_tables())

    # ── Plan generation ──────────────────────────────────

    async def _stage_plan(
        self, message: str, clarify_answers: dict | None = None,
    ) -> AsyncGenerator[AgentEvent, None]:
        """Generate analysis plan, yield planning events."""
        yield planning_start()

        from app.engine.planner import PlanningAgent
        planner = PlanningAgent()
        plan_result = await planner.generate(
            user_request=message,
            data_profiles=self._profiles,
            clarify_answers=clarify_answers,
            previous_plan=self._plan,
        )

        self._plan = plan_result
        goals = plan_result.get("goals", [])
        summary = plan_result.get("summary", "")
        warnings = plan_result.get("warnings", [])

        # Persist plan to DB
        plan_id = ""
        if self.db_session:
            from app.engine.plan_repo import PlanRepo
            repo = PlanRepo(self.db_session)
            version = 1
            if self._plan_id:
                # Update existing plan
                existing = await repo.get_by_id(self._plan_id)
                if existing:
                    version = existing.get("version", 1) + 1
                    await repo.update_goals(self._plan_id, goals, version)
                    plan_id = self._plan_id
            if not plan_id:
                plan_id = await repo.create(
                    session_id=self.session_id,
                    goals=goals,
                    mode=self._mode or "standard",
                )
            self._plan_id = plan_id
        else:
            version = 1

        yield plan_ready(
            goals=goals, version=version,
            summary=summary, warnings=warnings, plan_id=plan_id,
        )

    # ── Clarification ────────────────────────────────────

    async def _stage_clarify(self, message: str) -> AsyncGenerator[AgentEvent, None]:
        """Check if clarification is needed, yield clarify events."""
        if not self._plan:
            return

        from app.engine.clarifier import Clarifier
        clarifier = Clarifier()
        result = await clarifier.check(
            user_request=message,
            data_profiles=self._profiles,
            plan=self._plan,
        )

        if result.get("needs_clarification") and result.get("questions"):
            yield clarify_questions(result["questions"])
            return

        # No clarification needed — proceed to confirm
        if self._plan_id:
            yield plan_confirm_required(self._plan_id)

    # ── Quick mode execution ─────────────────────────────

    async def _run_quick(self, message: str) -> AsyncGenerator[AgentEvent, None]:
        """Quick mode: direct code gen + subprocess execution."""
        from app.engine.quick_executor import QuickExecutor
        executor = QuickExecutor(session_id=self.session_id)

        # Collect data paths from sources
        data_paths = await self._collect_data_paths()

        async for event in executor.execute(
            user_request=message,
            data_profiles=self._profiles,
            data_paths=data_paths,
        ):
            yield event

    # ── Standard/deep mode execution ─────────────────────

    async def _run_standard(self, message: str) -> AsyncGenerator[AgentEvent, None]:
        """Standard mode: plan → clarify → confirm → (execute in Step 16+)."""
        # Stage: Plan
        async for event in self._stage_plan(message):
            yield event

        # Stage: Clarify
        async for event in self._stage_clarify(message):
            yield event

        # If no clarify questions were yielded, confirm is already yielded
        # The actual execution will happen in Step 16 after user confirms

    # ── Simple conversation (no data sources) ────────────

    async def _run_conversation(self, message: str) -> AsyncGenerator[AgentEvent, None]:
        """Backward-compatible simple LLM conversation."""
        backend = llm_router.get_backend("default")

        ctx = self._build_prompt_context()
        system_prompt = prompt_assembler.assemble(ctx, task="default")

        messages: list[dict] = [{"role": "system", "content": system_prompt}]
        for h in self.history:
            messages.append({"role": h["role"], "content": h["content"]})
        messages.append({"role": "user", "content": message})

        try:
            async for chunk in backend.stream_chat(messages):
                if chunk["type"] == "text":
                    yield text_delta(chunk["content"])
        except Exception as e:
            yield error(str(e))

    # ── Resume methods (called from API endpoints) ───────

    async def resume_after_clarify(
        self, message: str, answers: dict,
    ) -> AsyncGenerator[AgentEvent, None]:
        """Resume pipeline after clarification answers."""
        # Reload profiles if needed
        if not self._profiles and self.db_session:
            from app.engine.source_loader import load_source_profiles
            self._profiles = await load_source_profiles(
                self.data_source_ids, self.db_session
            )

        # Load existing plan_id so _stage_plan updates it instead of creating new
        if not self._plan_id and self.db_session:
            from app.engine.plan_repo import PlanRepo
            repo = PlanRepo(self.db_session)
            plan = await repo.get_latest(self.session_id)
            if plan:
                self._plan_id = plan["id"]
                self._plan = {"goals": plan.get("goals", [])}

        # Regenerate plan with answers
        async for event in self._stage_plan(message, clarify_answers=answers):
            yield event

        # After plan update, request confirmation
        if self._plan_id:
            yield plan_confirm_required(self._plan_id)

        yield done()

    async def resume_after_confirm(self, plan_id: str) -> AsyncGenerator[AgentEvent, None]:
        """Resume pipeline after plan confirmation — execute goals."""
        # Load plan from DB
        goals = []
        if self.db_session:
            from app.engine.plan_repo import PlanRepo
            repo = PlanRepo(self.db_session)
            plan = await repo.get_by_id(plan_id)
            if plan:
                goals = plan.get("goals", [])
                await repo.update_status(plan_id, "executing")

        if not goals:
            yield error("未找到分析计划或计划中无目标")
            yield done()
            return

        # Load data paths
        if not self._profiles and self.db_session:
            from app.engine.source_loader import load_source_profiles
            self._profiles = await load_source_profiles(
                self.data_source_ids, self.db_session
            )

        data_paths = await self._collect_data_paths()

        # Execute
        from app.engine.executor import ExecutionEngine
        executor = ExecutionEngine(
            session_id=self.session_id,
            profiles=self._profiles,
            data_paths=data_paths,
            db_session=self.db_session,
        )

        # Collect execution data for report generation
        execution_data: list[dict] = []
        current_goal_data: dict | None = None

        async for event in executor.execute_plan(goals, plan_id):
            yield event
            # Track execution results for report
            if event.type == "goal_start":
                # Save previous goal data if any
                if current_goal_data is not None:
                    execution_data.append(current_goal_data)
                current_goal_data = {
                    "goal": next(
                        (g for g in goals if g.get("id") == event.data.get("goalId")),
                        {"title": event.data.get("title", "")},
                    ),
                    "stdout": "",
                    "insight": "",
                    "chart_urls": [],
                }
            elif current_goal_data is not None:
                if event.type == "execution_result":
                    rows = event.data.get("rows", [])
                    if rows and len(rows) == 1 and "output" in rows[0]:
                        current_goal_data["stdout"] = str(rows[0]["output"])
                    else:
                        current_goal_data["stdout"] = str(rows)[:2000]
                elif event.type == "insight":
                    current_goal_data["insight"] = event.data.get("text", "")
                elif event.type == "chart":
                    url = event.data.get("option", {}).get("url", "")
                    if url:
                        current_goal_data["chart_urls"].append(url)

        # Save the last goal's data
        if current_goal_data is not None:
            execution_data.append(current_goal_data)

        # Generate report only if at least one goal produced meaningful output
        has_meaningful_data = any(
            ex.get("stdout") or ex.get("chart_urls")
            for ex in execution_data
        )
        if execution_data and has_meaningful_data:
            yield reporting_start()
            try:
                from app.engine.reporter import ReportGenerator
                reporter = ReportGenerator()
                report_md = await reporter.generate(
                    goals=goals,
                    executions=execution_data,
                    data_profiles=self._profiles,
                )
                sources = [
                    f"目标{i+1}-{ex['goal'].get('title', '')}"
                    for i, ex in enumerate(execution_data)
                ]
                yield report_ready(report_md, sources)

                # Generate followup suggestions
                try:
                    suggestions = await self._generate_followup_suggestions(
                        report_md, execution_data
                    )
                    if not suggestions:
                        # Fallback: generate generic suggestions from goal titles
                        suggestions = self._fallback_followup_suggestions(execution_data)
                    if suggestions:
                        logger.info(f"Followup suggestions: {suggestions}")
                        yield followup_suggestions(suggestions)
                except Exception as e:
                    logger.warning(f"Followup suggestions failed: {e}")
                    # Still try fallback
                    fb = self._fallback_followup_suggestions(execution_data)
                    if fb:
                        yield followup_suggestions(fb)

                # Persist report to DB
                if self.db_session:
                    from app.engine.plan_repo import PlanRepo
                    repo = PlanRepo(self.db_session)
                    await repo.save_report(plan_id, report_md)
            except Exception as e:
                logger.warning(f"Report generation failed: {e}")

        # Mark plan as completed
        if self.db_session:
            from app.engine.plan_repo import PlanRepo
            repo = PlanRepo(self.db_session)
            await repo.update_status(plan_id, "completed")

        yield done()

    # ── Title & followup generation ─────────────────────

    async def _generate_title(self, message: str) -> str | None:
        """Generate a short session title from the user message."""
        try:
            backend = llm_router.get_backend("title_gen")
            prompt = "根据用户消息生成一个简短的会话标题（5-15个字），直接返回标题文本即可，不要引号。"
            result = await backend.chat(
                [{"role": "system", "content": prompt},
                 {"role": "user", "content": message[:200]}],
                temperature=0.3, max_tokens=30,
            )
            title = result.get("content", "").strip().strip('"\'')
            logger.info(f"Generated title: {title!r}")
            return title if 2 <= len(title) <= 30 else None
        except Exception as e:
            logger.warning(f"Title generation failed: {e}")
            # Fallback: use first 20 chars of user message
            fallback = message.strip()[:20]
            return fallback if len(fallback) >= 2 else None

    async def _generate_followup_suggestions(
        self, report_md: str, execution_data: list[dict]
    ) -> list[str]:
        """Generate 2-3 followup question suggestions based on the report."""
        try:
            backend = llm_router.get_backend("default")
            # Build summary of what was analyzed
            insights = "\n".join(
                ex.get("insight", "") for ex in execution_data if ex.get("insight")
            )
            prompt = f"""基于以下数据分析报告的关键发现，生成 2-3 个有价值的追问建议。

## 关键发现
{insights[:1500]}

要求：
- 每个追问一行，不要编号
- 追问应该是对当前分析的深挖或延伸
- 措辞简洁，像用户会自然提出的问题
- 只输出追问文本，不要其他说明"""

            result = await backend.chat(
                [{"role": "user", "content": prompt}],
                temperature=0.5, max_tokens=200,
            )
            lines = [l.strip() for l in result.get("content", "").strip().split("\n") if l.strip()]
            return lines[:3]
        except Exception as e:
            logger.warning(f"Followup suggestion generation failed: {e}")
            return []

    @staticmethod
    def _fallback_followup_suggestions(execution_data: list[dict]) -> list[str]:
        """Generate simple followup suggestions from goal titles when LLM fails."""
        suggestions = []
        for ex in execution_data[:3]:
            title = ex.get("goal", {}).get("title", "")
            if title:
                suggestions.append(f"深入分析{title}的具体原因")
        return suggestions[:3]

    # ── Helpers ───────────────────────────────────────────

    async def _collect_data_paths(self) -> list[str]:
        """Collect data paths from all sources, expanding multi-table database sources."""
        data_paths: list[str] = []
        if not self.db_session:
            return data_paths
        from app.engine.source_loader import load_source_records, expand_source_instances
        records = await load_source_records(self.data_source_ids, self.db_session)
        for rec in records:
            try:
                for src, _table in expand_source_instances(rec):
                    path = await src.get_data_path()
                    data_paths.append(path)
            except Exception as e:
                logger.warning(f"Failed to get data path for {rec['id']}: {e}")
        return data_paths

    def _build_prompt_context(self) -> PromptContext:
        """Build PromptContext from available data."""
        ctx = PromptContext(
            table_schemas=self.table_schemas,
            available_tools=["SQL查询", "Python分析", "数据画像"],
        )

        if self.table_schemas:
            summaries = []
            for ts in self.table_schemas:
                name = ts.get("tableName") or ts.get("name", "")
                cols = ts.get("columns") or ts.get("schema_info") or []
                row_count = ts.get("row_count", "")
                s = f"- {name}: {len(cols)} 列"
                if row_count:
                    s += f", {row_count} 行"
                summaries.append(s)
            ctx.data_profile_summary = "\n".join(summaries)

        # Layer 8: Memory / follow-up context
        ctx.conversation_summary = self._conversation_summary
        ctx.previous_results = self._previous_results

        # Enrich with profile data if available
        if self._profiles:
            profile_parts = []
            for p in self._profiles:
                name = p.get("source_name", "")
                rc = p.get("row_count", 0)
                cc = p.get("column_count", 0)
                profile_parts.append(f"- {name}: {cc} 列, {rc} 行")
                for col in p.get("columns", []):
                    dtype = col.get("dtype", "")
                    missing = col.get("missing_rate", 0)
                    profile_parts.append(f"  - {col['name']}: {dtype} (缺失率 {missing:.0%})")
            ctx.data_profile_summary = "\n".join(profile_parts)

        return ctx

    # ── Main entry point ─────────────────────────────────

    async def stream(self, user_message: str) -> AsyncGenerator[AgentEvent, None]:
        """Run the agent and yield SSE events."""
        logger.info(f"[stream] start — ds_ids={self.data_source_ids}, history_len={len(self.history)}")

        # No data sources → simple conversation
        if not self.data_source_ids:
            async for event in self._run_conversation(user_message):
                yield event
            yield done()
            return

        # Pre-load profiles for mode decision (lightweight, no events)
        logger.info("[stream] loading profiles...")
        await self._load_profiles()
        logger.info(f"[stream] profiles loaded: {len(self._profiles)} sources")

        # Load previous analysis results for context
        logger.info("[stream] loading previous results...")
        self._conversation_summary, self._previous_results = (
            await self._load_previous_results()
        )
        logger.info(f"[stream] previous results: summary={len(self._conversation_summary)} chars")

        # Stage 1: Mode classification (with data context)
        logger.info("[stream] classifying mode...")
        self._mode, reason = await self._classify_mode(user_message)
        logger.info(f"[stream] mode={self._mode}, reason={reason}")
        yield mode_info(self._mode, reason)

        # Generate title for first message in session
        # history includes the current message, so check for <= 1 user messages
        user_msgs_in_history = [h for h in self.history if h.get("role") == "user"]
        if len(user_msgs_in_history) <= 1:
            title = await self._generate_title(user_message)
            if title:
                yield title_suggestion(title)

        # Stage 2: Emit profiling events (data already loaded)
        async for event in self._stage_profile():
            yield event

        # Stage 3: Mode-specific pipeline
        try:
            if self._mode == "quick":
                async for event in self._run_quick(user_message):
                    yield event
            else:
                async for event in self._run_standard(user_message):
                    yield event
        except Exception as e:
            logger.exception("Pipeline error")
            yield error(str(e))

        yield done()

"""PlanningAgent — generates structured analysis plans via LLM."""

from __future__ import annotations

import logging
from typing import Any

from app.llm.router import llm_router
from app.llm.prompt_assembler import PromptAssembler, PromptContext
from app.prompts.planning import format_planning_prompt

logger = logging.getLogger(__name__)
prompt_assembler = PromptAssembler()


class PlanningAgent:
    """Generates analysis plans from user requests + data profiles."""

    async def generate(
        self,
        user_request: str,
        data_profiles: list[dict],
        clarify_answers: dict[str, str] | None = None,
        previous_plan: dict | None = None,
        max_goals: int = 5,
    ) -> dict[str, Any]:
        """Generate an analysis plan.

        Returns:
            {summary, goals: [{id, title, description, sql_hint}], warnings, clarify_questions}
        """
        # Build clarify context from answers
        clarify_context = ""
        if clarify_answers:
            parts = []
            for topic, answer in clarify_answers.items():
                parts.append(f"- {topic}: {answer}")
            clarify_context = "\n".join(parts)

        user_prompt = format_planning_prompt(
            user_request=user_request,
            profiles=data_profiles,
            max_goals=max_goals,
            clarify_context=clarify_context,
        )

        # Use the planner system prompt from prompt_assembler
        ctx = PromptContext(max_goals=max_goals)
        # Enrich with data profile summary
        if data_profiles:
            summaries = []
            for p in data_profiles:
                name = p.get("source_name", "")
                rc = p.get("row_count", 0)
                cc = p.get("column_count", 0)
                summaries.append(f"- {name}: {cc} 列, {rc} 行")
            ctx.data_profile_summary = "\n".join(summaries)

        system_prompt = prompt_assembler.assemble(ctx, task="planner")

        backend = llm_router.get_backend("planner")

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]

        try:
            result = await backend.generate_json(
                messages, temperature=0.2, max_tokens=2000
            )
        except Exception as e:
            logger.error(f"Plan generation failed: {e}")
            # Return a minimal fallback plan
            return {
                "summary": f"分析: {user_request}",
                "goals": [
                    {
                        "id": "g1",
                        "title": "数据概览",
                        "description": "查看数据基本情况",
                        "sql_hint": "SELECT * FROM data LIMIT 100",
                    }
                ],
                "warnings": [f"计划生成时出现错误: {str(e)}"],
                "clarify_questions": [],
            }

        # Ensure goal IDs are assigned
        goals = result.get("goals", [])
        for i, goal in enumerate(goals):
            if not goal.get("id"):
                goal["id"] = f"g{i + 1}"

        return {
            "summary": result.get("summary", ""),
            "goals": goals,
            "warnings": result.get("warnings", []),
            "clarify_questions": result.get("clarify_questions", []),
        }

"""Clarifier — checks if user request needs clarification before execution."""

from __future__ import annotations

import logging
from typing import Any

from app.llm.router import llm_router
from app.llm.prompt_assembler import PromptAssembler, PromptContext
from app.prompts.clarifying import format_clarify_prompt

logger = logging.getLogger(__name__)
prompt_assembler = PromptAssembler()


class Clarifier:
    """Determines if clarification questions should be asked."""

    async def check(
        self,
        user_request: str,
        data_profiles: list[dict],
        plan: dict,
    ) -> dict[str, Any]:
        """Check if clarification is needed.

        Returns:
            {needs_clarification: bool, questions: [{topic, question, default_assumption}]}
        """
        # Skip clarification for plans that already included clarify_questions
        plan_questions = plan.get("clarify_questions", [])
        if plan_questions:
            return {
                "needs_clarification": True,
                "questions": plan_questions[:3],
            }

        user_prompt = format_clarify_prompt(
            request=user_request,
            profiles=data_profiles,
            plan=plan,
        )

        ctx = PromptContext()
        system_prompt = prompt_assembler.assemble(ctx, task="default")

        backend = llm_router.get_backend("planner")

        messages = [
            {"role": "system", "content": system_prompt + "\n\n你是一个数据分析澄清助手。请判断用户的分析需求是否有歧义。"},
            {"role": "user", "content": user_prompt},
        ]

        try:
            result = await backend.generate_json(
                messages, temperature=0.1, max_tokens=800
            )
            needs = result.get("needs_clarification", False)
            questions = result.get("questions", [])

            # Validate question structure
            valid_questions = []
            for q in questions[:3]:
                if isinstance(q, dict) and "question" in q:
                    valid_questions.append({
                        "topic": q.get("topic", ""),
                        "question": q["question"],
                        "default_assumption": q.get("default_assumption", ""),
                    })

            return {
                "needs_clarification": needs and len(valid_questions) > 0,
                "questions": valid_questions,
            }
        except Exception as e:
            logger.warning(f"Clarification check failed: {e}")
            return {"needs_clarification": False, "questions": []}

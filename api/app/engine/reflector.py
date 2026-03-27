"""Reflector — L1 code fix + L2 result validation."""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass

from app.llm.router import llm_router

logger = logging.getLogger(__name__)


@dataclass
class ReflectionResult:
    passed: bool
    reason: str = ""
    fix_instruction: str = ""


class Reflector:
    """Validate execution results and provide fix instructions."""

    async def validate(
        self,
        goal: dict,
        code: str,
        stdout: str,
        profile: dict | None = None,
    ) -> ReflectionResult:
        """L2 validation: check if result looks reasonable."""
        # Rule-based checks first (no LLM call needed)
        rule_result = self._rule_check(stdout)
        if not rule_result.passed:
            return rule_result

        # LLM evaluation for non-trivial outputs
        if len(stdout) > 20:
            return await self._llm_evaluate(goal, code, stdout, profile)

        return ReflectionResult(passed=True)

    def _rule_check(self, stdout: str) -> ReflectionResult:
        """Quick rule-based validation."""
        if not stdout or stdout.strip() == "(无输出)":
            return ReflectionResult(
                passed=False,
                reason="代码执行无输出",
                fix_instruction="代码运行成功但没有输出。请确保用 print() 输出分析结果。",
            )

        # Check for all-NaN or all-null output
        if stdout.strip().lower() in ("nan", "none", "null"):
            return ReflectionResult(
                passed=False,
                reason="输出全为空值",
                fix_instruction="结果为 NaN/None。请检查数据过滤条件是否过于严格，或字段名是否正确。",
            )

        return ReflectionResult(passed=True)

    async def _llm_evaluate(
        self,
        goal: dict,
        code: str,
        stdout: str,
        profile: dict | None,
    ) -> ReflectionResult:
        """LLM-based result quality evaluation."""
        try:
            backend = llm_router.get_backend("default")

            profile_hint = ""
            if profile:
                rows = profile.get("row_count", "?")
                cols = profile.get("column_count", "?")
                profile_hint = f"数据集: {rows} 行 × {cols} 列"

            prompt = f"""你是一个数据分析质量审查员。请评估以下分析结果是否合理。

## 分析目标
{goal.get('title', '')}: {goal.get('description', '')}

## {profile_hint}

## 执行输出
{stdout[:2000]}

请判断：
1. 输出是否回答了分析目标？
2. 数值是否在合理范围内？
3. 是否有明显遗漏？

用 JSON 回复: {{"passed": true/false, "reason": "...", "fix_instruction": "..."}}
如果结果合理，passed=true。如果有问题，说明原因和修复建议。"""

            result = await backend.generate_json(
                [{"role": "user", "content": prompt}],
                temperature=0.0,
                max_tokens=500,
            )

            return ReflectionResult(
                passed=result.get("passed", True),
                reason=result.get("reason", ""),
                fix_instruction=result.get("fix_instruction", ""),
            )
        except Exception as e:
            logger.warning(f"LLM reflection failed, passing by default: {e}")
            return ReflectionResult(passed=True)

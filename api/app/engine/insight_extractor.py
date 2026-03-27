"""InsightExtractor — extract key findings from execution results."""

from __future__ import annotations

import logging

from app.llm.router import llm_router

logger = logging.getLogger(__name__)


class InsightExtractor:
    """Extract 1-3 key insights from a goal's execution output."""

    async def extract(
        self,
        goal: dict,
        stdout: str,
    ) -> str:
        """Return a short insight summary string."""
        if not stdout or len(stdout.strip()) < 10:
            return ""

        try:
            backend = llm_router.get_backend("default")
            prompt = f"""基于以下分析目标和执行结果，提取 1-3 句关键发现。

## 分析目标
{goal.get('title', '')}: {goal.get('description', '')}

## 执行结果
{stdout[:3000]}

用中文简洁总结关键发现，每句一行。只输出发现，不要前缀编号或标签。"""

            result = await backend.chat(
                [{"role": "user", "content": prompt}],
                temperature=0.2,
                max_tokens=300,
            )
            return result.get("content", "").strip()
        except Exception as e:
            logger.warning(f"Insight extraction failed: {e}")
            return ""

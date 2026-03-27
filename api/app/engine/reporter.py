"""ReportGenerator — produce a structured Markdown analysis report."""

from __future__ import annotations

import logging

from app.llm.router import llm_router

logger = logging.getLogger(__name__)


class ReportGenerator:
    """Generate a Markdown report from completed goal executions."""

    async def generate(
        self,
        goals: list[dict],
        executions: list[dict],
        data_profiles: list[dict],
    ) -> str:
        """Generate a Markdown analysis report.

        Args:
            goals: Plan goal definitions [{id, title, description, ...}].
            executions: Per-goal results [{goal, stdout, insight, chart_urls}].
            data_profiles: Data source profiles.

        Returns:
            Markdown string of the full report.
        """
        # Build context for the LLM
        goals_text = ""
        for i, ex in enumerate(executions):
            g = ex.get("goal", {})
            title = g.get("title", f"目标 {i + 1}")
            desc = g.get("description", "")
            stdout = ex.get("stdout", "")[:1000]
            insight = ex.get("insight", "")
            charts = ex.get("chart_urls", [])

            goals_text += f"\n### 目标 {i + 1}: {title}\n"
            goals_text += f"描述: {desc}\n"
            if stdout:
                goals_text += f"\n执行结果:\n```\n{stdout}\n```\n"
            if insight:
                goals_text += f"\n洞察: {insight}\n"
            if charts:
                for j, url in enumerate(charts):
                    goals_text += f"\n![图表{i+1}-{j+1}]({url})\n"

        # Data source summary
        data_text = ""
        for p in data_profiles:
            name = p.get("source_name", "")
            rows = p.get("row_count", 0)
            cols = p.get("column_count", 0)
            data_text += f"- {name}: {cols} 列, {rows} 行\n"

        prompt = f"""基于以下分析目标和执行结果，生成一份结构化的数据分析报告。

## 数据源
{data_text}

## 分析结果
{goals_text}

## 报告要求
请生成 Markdown 格式的报告，严格遵循以下结构：

# 数据分析报告

## 概述
1-2 句话总结本次分析的核心发现。

## 关键发现
- 每条发现独立一行，标注来源 [来源: 目标N-标题]
- 提取最有价值的 3-5 条发现

## 详细分析
按目标逐一展开分析过程和结果。

## 建议
基于分析结果给出 2-3 条可操作的建议。

注意：
- 使用中文
- 数据结论要严谨，避免过度解读
- 每条关键发现必须标注来源目标
- 在详细分析的对应小节中，用 Markdown 图片语法引用相关图表（如 ![图表1-1](/api/files/...)），不要修改图片URL
- 图表应穿插在对应分析段落中，而不是集中在一处
- 只输出 Markdown 报告内容，不要额外说明"""

        try:
            backend = llm_router.get_backend("default")
            result = await backend.chat(
                [{"role": "user", "content": prompt}],
                temperature=0.3,
                max_tokens=3000,
            )
            return result.get("content", "").strip()
        except Exception as e:
            logger.error(f"Report generation failed: {e}")
            return self._fallback_report(executions)

    @staticmethod
    def _fallback_report(executions: list[dict]) -> str:
        """Generate a minimal report when LLM fails."""
        lines = ["# 数据分析报告\n", "## 概述\n", "本次分析已完成以下目标：\n"]
        for i, ex in enumerate(executions):
            g = ex.get("goal", {})
            title = g.get("title", f"目标 {i + 1}")
            insight = ex.get("insight", "")
            lines.append(f"### 目标 {i + 1}: {title}\n")
            if insight:
                lines.append(f"{insight}\n")
        return "\n".join(lines)

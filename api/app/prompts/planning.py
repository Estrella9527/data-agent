"""Planning prompt templates — generates structured analysis plans."""

from __future__ import annotations


def _format_profile_summary(profiles: list[dict]) -> str:
    """Format data profiles into a concise text summary for the LLM."""
    if not profiles:
        return "无可用数据源"

    parts = []
    for p in profiles:
        name = p.get("source_name", "未知")
        rc = p.get("row_count", 0)
        cc = p.get("column_count", 0)
        part = f"### {name}\n- {rc} 行 × {cc} 列\n"

        cols = p.get("columns", [])
        if cols:
            part += "- 字段:\n"
            for col in cols[:15]:
                dtype = col.get("dtype", "")
                missing = col.get("missing_rate", 0)
                part += f"  - `{col['name']}` ({dtype}, 缺失率 {missing:.0%})\n"

        issues = p.get("quality_issues", [])
        if issues:
            part += "- 质量问题:\n"
            for issue in issues:
                part += f"  - ⚠ {issue.get('description', '')}\n"

        parts.append(part)

    return "\n".join(parts)


def format_planning_prompt(
    user_request: str,
    profiles: list[dict],
    max_goals: int = 5,
    clarify_context: str = "",
) -> str:
    """Build the full planning prompt.

    Returns a user-role message to send alongside the planner system prompt.
    """
    profile_text = _format_profile_summary(profiles)

    prompt = f"""## 用户需求
{user_request}

## 可用数据
{profile_text}
"""

    if clarify_context:
        prompt += f"""
## 澄清信息
{clarify_context}
"""

    prompt += f"""
## 输出要求
请根据以上信息，将用户需求分解为 1-{max_goals} 个分析目标。

规则：
1. 目标数量 1-{max_goals} 个，通常 3-5 个
2. 第一个目标通常是数据概览/清洗
3. 最后一个目标是汇总/结论
4. 每个目标应可独立执行
5. 如果数据不足以回答用户问题，在 clarify_questions 中列出需要澄清的问题（最多3个）

严格输出 JSON 格式：
```json
{{
  "summary": "分析计划简要描述",
  "goals": [
    {{"id": "g1", "title": "...", "description": "...", "sql_hint": "..."}}
  ],
  "warnings": ["..."],
  "clarify_questions": [
    {{"topic": "时间范围", "question": "数据的时间范围是？", "default_assumption": "使用全部数据"}}
  ]
}}
```
"""
    return prompt

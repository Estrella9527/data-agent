"""Clarification prompt templates."""

from __future__ import annotations


def format_clarify_prompt(
    request: str,
    profiles: list[dict],
    plan: dict,
) -> str:
    """Build the clarification check prompt.

    The LLM should identify ambiguities that could affect analysis quality.
    """
    goals_text = ""
    for g in plan.get("goals", []):
        goals_text += f"- {g.get('id')}: {g.get('title')} — {g.get('description', '')}\n"

    profile_text = ""
    for p in profiles:
        name = p.get("source_name", "")
        profile_text += f"\n### {name}\n"
        for col in p.get("columns", [])[:10]:
            dtype = col.get("dtype", "")
            missing = col.get("missing_rate", 0)
            profile_text += f"- `{col['name']}` ({dtype}, 缺失率 {missing:.0%})\n"
        issues = p.get("quality_issues", [])
        for issue in issues:
            profile_text += f"- ⚠ {issue.get('description', '')}\n"

    prompt = f"""## 用户需求
{request}

## 分析计划
{goals_text}

## 数据概况
{profile_text}

## 检查清单
请检查以下方面是否存在歧义或需要用户确认：
1. 时间字段：是否有多个时间字段？应该用哪个？
2. 分组维度：用户要求的分组是否明确？
3. 数值指标：要分析的数值字段是否明确？
4. 数据质量：是否有质量问题会影响分析结果？

## 输出 JSON
如果需要澄清，输出：
```json
{{
  "needs_clarification": true,
  "questions": [
    {{"topic": "时间范围", "question": "数据包含多个时间字段，请问应该使用哪个？", "default_assumption": "使用 created_at 字段"}}
  ]
}}
```
如果不需要澄清：
```json
{{"needs_clarification": false, "questions": []}}
```

最多提出 3 个问题。只在确实存在歧义时才提问，不要为了提问而提问。
"""
    return prompt

"""PromptAssembler — 8-layer hierarchical prompt composition per PRD §3.

Layer 1: Role       — 基础角色定义
Layer 2: Instruction — 分析框架指示（按任务不同）
Layer 3: Domain     — 领域知识（行业 + 通用指标）
Layer 4: Data       — 数据上下文（schema + profile 摘要）
Layer 5: Behavior   — 行为控制（输出格式、约束）
Layer 6: Report     — 报告格式要求
Layer 7: Skills     — 可用技能/工具描述
Layer 8: Memory     — 会话记忆 / 追问上下文
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional


@dataclass
class PromptContext:
    """Context gathered for prompt assembly."""
    # Layer 4: Data context
    table_schemas: list[dict] = field(default_factory=list)
    data_profile_summary: str = ""
    data_source_names: list[str] = field(default_factory=list)

    # Layer 3: Domain knowledge
    domain_hints: str = ""

    # Layer 5: Behavior
    output_language: str = "zh-CN"
    max_goals: int = 5
    code_type: str = "python"  # python | sql

    # Layer 6: Report format
    report_format: str = "markdown"
    include_charts: bool = True

    # Layer 7: Skills
    available_tools: list[str] = field(default_factory=list)

    # Layer 8: Memory / follow-up
    conversation_summary: str = ""
    previous_results: str = ""

    # Pipeline context
    clarify_answers: dict[str, str] | None = None
    plan_context: str = ""


# ── Layer 1: Role ──

ROLE_BASE = """你是「重明」——一位专业的数据分析 AI 助手。
你具备以下核心能力：
• 理解自然语言中的数据分析需求
• 将需求分解为可执行的分析目标
• 编写精确的 SQL 查询和 Python 分析代码
• 发现数据中的模式、异常和趋势
• 生成清晰的分析报告和可视化图表

你的工作原则：
• 先理解需求，再制定方案，最后执行
• 对数据结论保持严谨，避免过度解读
• 主动指出数据质量问题和分析局限性"""


# ── Layer 2: Task-specific instructions ──

TASK_INSTRUCTIONS = {
    "planner": """## 分析规划指示

你正在进行分析规划阶段。请根据用户的问题和可用的数据源：
1. 将用户需求分解为 1-{max_goals} 个具体的分析目标
2. 每个目标要明确：做什么分析、用什么数据、预期结果
3. 目标之间要有逻辑递进关系
4. 如果用户的需求不够明确，列出需要澄清的问题

输出严格 JSON 格式：
```json
{{
  "goals": [
    {{"id": "g1", "title": "...", "description": "...", "sql_hint": "..."}},
  ],
  "clarify_questions": ["..."]  // 可选，需要澄清时才有
}}
```""",

    "code_gen": """## 代码生成指示

你正在为一个分析目标生成执行代码。要求：
1. 代码必须完整可执行，不要省略
2. SQL 查询注意 NULL 处理和类型转换
3. Python 代码使用 pandas，结果赋值给 `result` 变量
4. 注释说明关键步骤的目的
5. 考虑数据量和性能""",

    "reflector": """## 结果反思指示

你正在审查一个分析步骤的执行结果。请检查：
1. 结果是否合理（数值范围、数据量）
2. 是否存在明显的数据异常或计算错误
3. 是否完整回答了对应的分析目标
4. 代码是否有优化空间

如果发现问题，输出修正建议的 JSON：
```json
{{"pass": false, "issue": "...", "fix_suggestion": "..."}}
```
如果通过，输出：
```json
{{"pass": true, "insight": "从结果中可以得出..."}}
```""",

    "insight": """## 洞察生成指示

基于分析结果，提供有价值的业务洞察：
1. 核心发现：数据说明了什么
2. 趋势/模式：是否存在规律
3. 异常/风险：是否有需要关注的点
4. 建议行动：基于分析可以做什么""",

    "reporter": """## 报告生成指示

将分析结果整理为结构化报告。报告应包含：
1. **摘要**：用 1-2 句话概括核心发现
2. **详细分析**：每个分析目标的结果
3. **数据表格**：关键数据以表格呈现
4. **可视化建议**：推荐合适的图表类型和配置
5. **结论与建议**：总结性观点

使用 Markdown 格式。图表配置使用 ECharts option 格式。""",

    "title_gen": """根据用户消息生成一个简短的会话标题（5-15个字），直接返回标题文本即可。""",

    "mode_route": """判断用户的数据分析请求属于哪种模式：

## 模式定义
- "quick": 简单直接的问题 — 单指标查询、基本统计、数据筛选
  例: "今天总收入多少" / "最近7天订单数" / "最大值是多少"
- "standard": 需要多步分析规划 — 多维度分析、趋势对比、分组统计
  例: "分析销售趋势" / "各渠道转化率对比" / "找出异常订单"
- "deep": 复杂探索性问题 — 需要假设验证、多轮迭代、深度建模
  例: "全面分析用户流失原因" / "建立预测模型" / "深度诊断业务健康度"

## 辅助判断规则
- 涉及单一指标或简单聚合 → quick
- 涉及多个指标、对比、趋势、分组 → standard
- 包含"全面"、"深度"、"诊断"等词，或数据源多于2个 → deep
- 用户请求含"为什么"、"原因"类因果分析 → standard 或 deep

## 数据上下文
{data_context}

输出 JSON: {{"mode": "quick|standard|deep", "reason": "一句话理由"}}""",

    "default": """根据用户的问题给出专业的数据分析回答。
如果涉及数据查询或计算，提供清晰的分析思路。
回答使用中文，保持专业但易懂。""",
}


# ── Layer 3: Domain knowledge ──

DOMAIN_COMMON = """## 通用分析指标
- 增长率 = (本期 - 上期) / 上期 × 100%
- 占比 = 部分 / 总体 × 100%
- 同比 = 与去年同期对比
- 环比 = 与上一周期对比
- 移动平均 = 近 N 期的平均值"""


# ── Layer 5: Behavior ──

BEHAVIOR_RULES = """## 行为规则
- 回复语言: {language}
- SQL 方言: 使用标准 ANSI SQL，避免特定数据库方言
- 数值精度: 金额保留 2 位小数，百分比保留 1 位小数
- 时间处理: 明确时区，默认使用数据中的时间格式
- 空值处理: 所有聚合计算中显式处理 NULL"""


class PromptAssembler:
    """Assembles multi-layer prompts for different analysis tasks."""

    def assemble(self, ctx: PromptContext, task: str = "default") -> str:
        """Compose a complete system prompt from all applicable layers.

        Args:
            ctx: Context containing data schemas, domain info, etc.
            task: Task type (planner, code_gen, reflector, etc.)

        Returns:
            Assembled system prompt string.
        """
        parts: list[str] = []

        # Layer 1: Role
        parts.append(ROLE_BASE)

        # Layer 2: Task instruction
        instruction = TASK_INSTRUCTIONS.get(task, TASK_INSTRUCTIONS["default"])
        instruction = instruction.replace("{max_goals}", str(ctx.max_goals))
        parts.append(instruction)

        # Layer 3: Domain knowledge
        parts.append(DOMAIN_COMMON)
        if ctx.domain_hints:
            parts.append(f"\n## 领域知识\n{ctx.domain_hints}")

        # Layer 4: Data context
        if ctx.table_schemas:
            data_section = "\n## 可用数据\n"
            for ts in ctx.table_schemas:
                name = ts.get("tableName") or ts.get("name", "未知表")
                data_section += f"\n### 表: {name}\n"
                columns = ts.get("columns") or ts.get("schema_info") or []
                for col in columns:
                    if isinstance(col, str):
                        data_section += f"- `{col}`\n"
                    else:
                        col_name = col.get("name", "")
                        col_type = col.get("type") or col.get("dtype", "")
                        nullable = " (可空)" if col.get("nullable") else ""
                        data_section += f"- `{col_name}`: {col_type}{nullable}\n"
            parts.append(data_section)

        if ctx.data_profile_summary:
            parts.append(f"\n## 数据概况\n{ctx.data_profile_summary}")

        # Layer 5: Behavior
        language_map = {"zh-CN": "中文", "en": "English"}
        behavior = BEHAVIOR_RULES.replace(
            "{language}", language_map.get(ctx.output_language, ctx.output_language)
        )
        parts.append(behavior)

        # Layer 6: Report format (only for reporter task)
        if task == "reporter" and ctx.include_charts:
            parts.append("\n## 图表要求\n图表使用 ECharts option JSON 格式，包裹在 ```echarts 代码块中。")

        # Layer 7: Skills / tools
        if ctx.available_tools:
            tools_text = "\n## 可用工具\n"
            for t in ctx.available_tools:
                tools_text += f"- {t}\n"
            parts.append(tools_text)

        # Layer 8: Memory / follow-up context
        if ctx.conversation_summary:
            parts.append(f"\n## 对话上下文\n{ctx.conversation_summary}")

        if ctx.previous_results:
            parts.append(f"\n## 前序分析结果\n{ctx.previous_results}")

        if ctx.clarify_answers:
            answers_text = "\n".join(
                f"- {k}: {v}" for k, v in ctx.clarify_answers.items()
            )
            parts.append(f"\n## 用户澄清\n{answers_text}")

        if ctx.plan_context:
            parts.append(f"\n## 分析计划上下文\n{ctx.plan_context}")

        return "\n\n".join(parts)


# Singleton
prompt_assembler = PromptAssembler()

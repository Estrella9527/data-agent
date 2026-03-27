"""Code generation prompt templates."""

from __future__ import annotations


def format_code_gen_prompt(
    goal: dict,
    profile: dict,
    code_type: str = "python",
) -> str:
    """Build the code generation prompt for a specific goal."""
    goal_title = goal.get("title", "")
    goal_desc = goal.get("description", "")
    sql_hint = goal.get("sql_hint", "")
    source_name = profile.get("source_name", "")

    cols_text = ""
    for col in profile.get("columns", [])[:20]:
        cols_text += f"  - `{col['name']}` ({col.get('dtype', '')})\n"

    prompt = f"""## 分析目标
{goal_title}: {goal_desc}

## 数据源: {source_name}
- {profile.get('row_count', 0)} 行 × {profile.get('column_count', 0)} 列
- 字段:
{cols_text}

## SQL 提示
{sql_hint}

## 代码类型: {code_type}
"""

    if code_type == "python":
        prompt += """
请生成完整可执行的 Python 代码。要求：
1. 使用 pandas 读取数据
2. 数据文件路径通过 DATA_PATH 变量注入
3. 最终结果赋值给 `result` 变量
4. result 应是一个 dict，包含 summary(文字说明) 和 data(数据)
5. 处理缺失值和类型转换
"""
    return prompt


def format_quick_prompt(
    request: str,
    profiles: list[dict],
    data_paths: list[str],
) -> str:
    """Build prompt for quick mode — single question, direct answer."""
    profile_text = ""
    rel_paths: list[str] = []
    for i, p in enumerate(profiles):
        abs_path = data_paths[i] if i < len(data_paths) else "unknown"
        # Use relative path inside sandbox: data/<filename>
        filename = abs_path.rsplit("/", 1)[-1] if "/" in abs_path else abs_path
        rel = f"data/{filename}"
        rel_paths.append(rel)
        profile_text += f"\n### 数据源: {p.get('source_name', '')}\n"
        profile_text += f"文件路径: `{rel}`\n"
        profile_text += f"{p.get('row_count', 0)} 行 × {p.get('column_count', 0)} 列\n"
        for col in p.get("columns", [])[:15]:
            profile_text += f"  - `{col['name']}` ({col.get('dtype', '')})\n"

    prompt = f"""用户问题: {request}

{profile_text}

请生成一段 Python 代码来回答用户的问题。要求：
1. 使用 pandas 读取数据 (pd.read_csv / pd.read_excel)
2. 数据文件使用相对路径: {rel_paths}
3. 将最终答案通过 print() 输出，格式清晰
4. 代码简洁直接，只做用户要求的计算
5. 处理缺失值

只输出 Python 代码，不要解释。代码用 ```python 包裹。
"""
    return prompt


def format_goal_execution_prompt(
    goal: dict,
    profiles: list[dict],
    data_paths: list[str],
    goal_index: int = 0,
    charts_dir: str = "",
    fix_context: str = "",
    error_context: str = "",
) -> str:
    """Build prompt for standard/deep mode goal execution."""
    goal_title = goal.get("title", "")
    goal_desc = goal.get("description", "")
    sql_hint = goal.get("sql_hint", "")

    profile_text = ""
    rel_paths: list[str] = []
    for i, p in enumerate(profiles):
        abs_path = data_paths[i] if i < len(data_paths) else "unknown"
        filename = abs_path.rsplit("/", 1)[-1] if "/" in abs_path else abs_path
        rel = f"data/{filename}"
        rel_paths.append(rel)
        profile_text += f"\n### 数据源: {p.get('source_name', '')}\n"
        profile_text += f"文件路径: `{rel}`\n"
        profile_text += f"{p.get('row_count', 0)} 行 × {p.get('column_count', 0)} 列\n"
        for col in p.get("columns", [])[:20]:
            profile_text += f"  - `{col['name']}` ({col.get('dtype', '')})"
            if col.get("missing_rate", 0) > 0:
                profile_text += f" [缺失 {col['missing_rate']:.0%}]"
            profile_text += "\n"

    prompt = f"""## 分析目标 (目标 {goal_index + 1})
**{goal_title}**
{goal_desc}

{f"SQL提示: {sql_hint}" if sql_hint else ""}

## 可用数据
{profile_text}

## 要求
请生成完整可执行的 Python 代码。

1. 使用 pandas 读取数据 (pd.read_csv / pd.read_excel，根据文件扩展名判断)
2. 数据文件使用相对路径: {rel_paths}
3. 先用 df.head() / df.dtypes / df.describe() 探索数据结构
4. 处理缺失值和类型转换
5. 将分析结果通过 print() 清晰输出
6. 如果需要图表，使用 matplotlib 保存到 `{charts_dir}/` 目录"""

    if charts_dir:
        prompt += f"""
7. 图表设置:
   - figsize=(10, 6), dpi=150
   - 中文标题和标签
   - plt.tight_layout() 确保不截断
   - 配色方案: 使用专业配色 ['#2563EB', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899']
   - 图表文件名用描述性后缀避免覆盖，如 '{charts_dir}/chart_trend.png', '{charts_dir}/chart_dist.png'
   - plt.savefig('路径', dpi=150, bbox_inches='tight', facecolor='white')
8. 设置中文字体: plt.rcParams['font.sans-serif'] = ['Arial Unicode MS', 'SimHei', 'DejaVu Sans']
9. 图表美化: 去掉顶部和右侧边框 (ax.spines['top'].set_visible(False) 等)，网格线用浅色 (alpha=0.3)"""

    if error_context:
        prompt += f"""

## 上次执行报错
```
{error_context[:1500]}
```
请修复上述错误。"""

    if fix_context:
        prompt += f"""

## 策略调整建议
{fix_context}
请根据上述建议调整分析策略。"""

    prompt += """

只输出 Python 代码，不要解释。代码用 ```python 包裹。"""
    return prompt

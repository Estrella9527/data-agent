"""Shared utilities for extracting code from LLM responses."""

from __future__ import annotations

import ast
import logging
import re

logger = logging.getLogger(__name__)


def extract_python_code(content: str) -> str:
    """Extract Python code from LLM response, stripping markdown fences."""
    if not content:
        return ""

    # 1. Try standard ```python ... ``` extraction
    match = re.search(r"```python\s*\n?(.*?)```", content, re.DOTALL)
    if match:
        return match.group(1).strip()

    # 2. Try generic ``` ... ``` extraction
    match = re.search(r"```\s*\n?(.*?)```", content, re.DOTALL)
    if match:
        return match.group(1).strip()

    # 3. If content was truncated (no closing ```), extract from opening fence
    match = re.search(r"```python\s*\n?(.*)", content, re.DOTALL)
    if match:
        code = match.group(1).strip()
        # Remove trailing incomplete line
        lines = code.split("\n")
        if lines:
            return "\n".join(lines).strip()

    # 4. Fallback: looks like code, but strip any residual fence lines
    cleaned = "\n".join(
        line for line in content.strip().splitlines()
        if not line.strip().startswith("```")
    )
    if cleaned and ("import " in cleaned or "print(" in cleaned or "=" in cleaned):
        return cleaned.strip()

    return ""


def validate_python_syntax(code: str) -> tuple[bool, str]:
    """Check if Python code is syntactically valid using ast.parse().

    Returns (is_valid, error_message).
    """
    if not code.strip():
        return False, "Empty code"
    try:
        ast.parse(code)
        return True, ""
    except SyntaxError as e:
        return False, f"Line {e.lineno}: {e.msg}"

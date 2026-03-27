"""SSE event definitions per PRD 8.4."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any
import json


@dataclass
class AgentEvent:
    """Base SSE event sent to the client."""
    type: str
    data: dict[str, Any] = field(default_factory=dict)

    def to_sse(self) -> str:
        payload = {"type": self.type, **self.data}
        return f"data: {json.dumps(payload, ensure_ascii=False, default=str)}\n\n"


# --- Pipeline stage events ---

def mode_info(mode: str, reason: str = "") -> AgentEvent:
    return AgentEvent("mode_info", {"mode": mode, "reason": reason})

def profiling_start() -> AgentEvent:
    return AgentEvent("profiling_start")

def profile_ready(tables: list[dict]) -> AgentEvent:
    return AgentEvent("profile_ready", {"tables": tables})

def planning_start() -> AgentEvent:
    return AgentEvent("planning_start")

def plan_ready(goals: list[dict], version: int = 1, summary: str = "",
               warnings: list[str] | None = None, plan_id: str = "") -> AgentEvent:
    return AgentEvent("plan_ready", {
        "goals": goals, "version": version, "summary": summary,
        "warnings": warnings or [], "planId": plan_id,
    })

def clarify_questions(questions: list[dict]) -> AgentEvent:
    """questions: [{topic, question, default_assumption}]"""
    return AgentEvent("clarify_questions", {"questions": questions})

def plan_updated(goals: list[dict], version: int = 1, summary: str = "", plan_id: str = "") -> AgentEvent:
    return AgentEvent("plan_updated", {"goals": goals, "version": version, "summary": summary, "planId": plan_id})

def plan_confirm_required(plan_id: str, version: int = 1) -> AgentEvent:
    return AgentEvent("confirm_required", {"planId": plan_id, "version": version})

# --- Execution events ---

def goal_start(goal_id: str, title: str, index: int, total: int) -> AgentEvent:
    return AgentEvent("goal_start", {"goalId": goal_id, "title": title, "index": index, "total": total})

def code_generated(goal_id: str, code: str, code_type: str, explanation: str = "") -> AgentEvent:
    return AgentEvent("code_generated", {"goalId": goal_id, "code": code, "codeType": code_type, "explanation": explanation})

def execution_start(goal_id: str) -> AgentEvent:
    return AgentEvent("execution_start", {"goalId": goal_id})

def execution_result(goal_id: str, columns: list, rows: list, row_count: int) -> AgentEvent:
    return AgentEvent("execution_result", {"goalId": goal_id, "columns": columns, "rows": rows, "rowCount": row_count})

def error_retry(goal_id: str, error: str, attempt: int, max_attempts: int) -> AgentEvent:
    return AgentEvent("error_retry", {"goalId": goal_id, "error": error, "attempt": attempt, "maxAttempts": max_attempts})

def reflection_failed(goal_id: str, reason: str) -> AgentEvent:
    return AgentEvent("reflection_failed", {"goalId": goal_id, "reason": reason})

# --- Report events ---

def chart(goal_id: str, chart_type: str, option: dict) -> AgentEvent:
    return AgentEvent("chart", {"goalId": goal_id, "chartType": chart_type, "option": option})

def insight(goal_id: str, text: str) -> AgentEvent:
    return AgentEvent("insight", {"goalId": goal_id, "text": text})

def reporting_start() -> AgentEvent:
    return AgentEvent("reporting_start")

def report_ready(markdown: str, sources: list[str] | None = None) -> AgentEvent:
    return AgentEvent("report_ready", {"markdown": markdown, "sources": sources or []})

# --- Session / UX events ---

def title_suggestion(title: str) -> AgentEvent:
    return AgentEvent("title_suggestion", {"title": title})

def followup_suggestions(suggestions: list[str]) -> AgentEvent:
    return AgentEvent("followup_suggestions", {"suggestions": suggestions})

def heartbeat() -> AgentEvent:
    return AgentEvent("heartbeat")

# --- General events ---

def text_delta(content: str) -> AgentEvent:
    return AgentEvent("text", {"content": content})

def error(message: str, recoverable: bool = False) -> AgentEvent:
    return AgentEvent("error", {"message": message, "recoverable": recoverable})

def done() -> AgentEvent:
    return AgentEvent("done")

def message_id(msg_id: str) -> AgentEvent:
    return AgentEvent("message_id", {"messageId": msg_id})

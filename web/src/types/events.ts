/**
 * SSE event types — PRD 8.4 complete protocol.
 */

export type AgentEventType =
  | "mode_info"
  | "profiling_start"
  | "profile_ready"
  | "planning_start"
  | "plan_ready"
  | "clarify_questions"
  | "plan_updated"
  | "confirm_required"
  | "goal_start"
  | "code_generated"
  | "execution_start"
  | "execution_result"
  | "error_retry"
  | "reflection_failed"
  | "chart"
  | "insight"
  | "reporting_start"
  | "report_ready"
  | "text"
  | "tool_call"
  | "tool_result"
  | "error"
  | "done"
  | "message_id"
  | "title_suggestion"
  | "followup_suggestions"
  | "heartbeat";

export interface AgentEvent {
  type: AgentEventType;
  mode?: "quick" | "standard" | "deep";
  reason?: string;
  content?: string;
  goals?: Goal[];
  version?: number;
  summary?: string;
  warnings?: string[];
  planId?: string;
  questions?: ClarifyQuestion[] | string[];
  tables?: ProfileTable[];
  goalId?: string;
  title?: string;
  index?: number;
  total?: number;
  code?: string;
  codeType?: string;
  explanation?: string;
  columns?: string[];
  rows?: Record<string, unknown>[];
  rowCount?: number;
  error?: string;
  attempt?: number;
  maxAttempts?: number;
  message?: string;
  recoverable?: boolean;
  chartType?: string;
  option?: Record<string, unknown>;
  markdown?: string;
  sources?: string[];
  toolCallId?: string;
  name?: string;
  arguments?: string;
  result?: unknown;
  messageId?: string;
  text?: string; // insight event text
  suggestions?: string[];
}

export interface Goal {
  id: string;
  title: string;
  description?: string;
  sql_hint?: string;
  status?: string;
}

export interface ClarifyQuestion {
  topic: string;
  question: string;
  default_assumption: string;
}

export interface ProfileTable {
  name: string;
  sourceId: string;
  rowCount: number;
  columnCount: number;
  columns: ProfileColumn[];
  qualityIssues: QualityIssue[];
}

export interface ProfileColumn {
  name: string;
  dtype: string;
  nullable?: boolean;
  sample_values?: unknown[];
  missing_rate?: number;
  missing_count?: number;
  unique_count?: number;
  min_value?: unknown;
  max_value?: unknown;
  mean_value?: number;
}

export interface QualityIssue {
  column: string | null;
  issue_type: string;
  description: string;
  severity: string;
}

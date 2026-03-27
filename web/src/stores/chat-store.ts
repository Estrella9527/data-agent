import { create } from "zustand";
import type { Message } from "@/types/session";
import type {
  AgentEvent,
  Goal,
  ClarifyQuestion,
  ProfileTable,
} from "@/types/events";
import { streamChat } from "@/lib/agent-client";

/** Per-goal execution progress tracked during the execute phase. */
export interface GoalExecution {
  goalId: string;
  title: string;
  index: number;
  total: number;
  status: "pending" | "running" | "success" | "error" | "retrying";
  code?: string;
  codeType?: string;
  columns?: string[];
  rows?: Record<string, unknown>[];
  rowCount?: number;
  insight?: string;
  chartUrls?: string[];
  chartInterpretations?: Record<string, string>;
  error?: string;
  attempt?: number;
  maxAttempts?: number;
}

/** Snapshot of pipeline state saved per-turn for historical rendering. */
export interface ExecutionSnapshot {
  currentMode: "quick" | "standard" | "deep" | null;
  modeReason: string | null;
  profileData: ProfileTable[];
  currentGoals: Goal[];
  planSummary: string;
  planWarnings: string[];
  planVersion: number;
  planId: string | null;
  goalExecutions: GoalExecution[];
  reportMarkdown: string | null;
  reportSources: string[];
  followupSuggestions: string[];
  pipelineState: string;
}

interface ChatState {
  messages: Message[];
  isStreaming: boolean;
  streamingContent: string;
  error: string | null;

  // Pipeline state
  currentMode: "quick" | "standard" | "deep" | null;
  modeReason: string | null;
  currentGoals: Goal[];
  planVersion: number;
  planId: string | null;
  planSummary: string;
  planWarnings: string[];
  profileData: ProfileTable[];
  pipelineState:
    | "idle"
    | "profiling"
    | "planning"
    | "clarifying"
    | "waiting_confirm"
    | "executing"
    | "completed";
  clarifyQuestions: ClarifyQuestion[];
  awaitingConfirm: boolean;

  // Execution state
  goalExecutions: GoalExecution[];
  activeGoalId: string | null;

  // Report state
  reportMarkdown: string | null;
  reportSources: string[];
  followupSuggestions: string[];

  // Data source binding
  sessionDataSourceIds: string[];

  // Actions
  setSessionDataSourceIds: (ids: string[]) => void;
  loadMessages: (sessionId: string) => Promise<void>;
  sendMessage: (
    sessionId: string,
    content: string,
    onTitleSuggestion?: (title: string) => void
  ) => Promise<void>;
  stopStreaming: () => void;
  clearChat: () => void;
  submitClarifyAnswers: (
    sessionId: string,
    answers: Record<string, string>
  ) => Promise<void>;
  skipClarify: (sessionId: string) => Promise<void>;
  confirmPlan: (sessionId: string, planId: string) => Promise<void>;
  modifyPlan: (sessionId: string, planId: string) => Promise<void>;
}

let abortController: AbortController | null = null;

/** Timeout for SSE streams — if no data for this long, consider dead. */
const SSE_TIMEOUT_MS = 120_000;

/** Parse SSE stream from a fetch Response, calling onEvent per parsed event. */
async function consumeSSE(
  response: Response,
  onEvent: (event: AgentEvent) => void,
  signal?: AbortSignal
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) return;

  const decoder = new TextDecoder();
  let buffer = "";
  let timeoutTimer: ReturnType<typeof setTimeout> | null = null;

  const resetTimeout = () => {
    if (timeoutTimer) clearTimeout(timeoutTimer);
    timeoutTimer = setTimeout(() => {
      reader.cancel().catch(() => {});
    }, SSE_TIMEOUT_MS);
  };

  const processLines = (lines: string[]): boolean => {
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6);
      if (data === "[DONE]") return true; // signal done
      try {
        onEvent(JSON.parse(data) as AgentEvent);
      } catch {
        // skip malformed JSON
      }
    }
    return false;
  };

  try {
    resetTimeout();
    while (true) {
      if (signal?.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;

      resetTimeout();
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      if (processLines(lines)) return;
    }

    // Flush remaining buffer after stream closes
    if (buffer.trim()) {
      const remaining = buffer.split("\n");
      processLines(remaining);
    }
  } finally {
    if (timeoutTimer) clearTimeout(timeoutTimer);
    reader.releaseLock();
  }
}

/** Capture current pipeline state as a snapshot. Returns null if nothing to snapshot. */
function captureSnapshot(state: ChatState): ExecutionSnapshot | null {
  if (
    !state.currentMode &&
    state.currentGoals.length === 0 &&
    state.goalExecutions.length === 0
  ) {
    return null;
  }
  return {
    currentMode: state.currentMode,
    modeReason: state.modeReason,
    profileData: state.profileData,
    currentGoals: state.currentGoals,
    planSummary: state.planSummary,
    planWarnings: state.planWarnings,
    planVersion: state.planVersion,
    planId: state.planId,
    goalExecutions: state.goalExecutions,
    reportMarkdown: state.reportMarkdown,
    reportSources: state.reportSources,
    followupSuggestions: state.followupSuggestions,
    pipelineState: state.pipelineState,
  };
}

/** Attach a snapshot to the last assistant message, or create one if none exists. */
function attachSnapshotToMessages(
  messages: Message[],
  snapshot: ExecutionSnapshot,
  sessionId: string
): Message[] {
  const updated = [...messages];
  for (let i = updated.length - 1; i >= 0; i--) {
    if (updated[i].role === "assistant") {
      updated[i] = {
        ...updated[i],
        metadata: {
          ...((updated[i].metadata as Record<string, unknown>) || {}),
          executionSnapshot: snapshot,
        },
      };
      return updated;
    }
  }
  // No assistant message found — create a placeholder
  updated.push({
    id: "msg-snapshot-" + Date.now(),
    sessionId,
    role: "assistant",
    content: "",
    metadata: { executionSnapshot: snapshot },
    createdAt: new Date().toISOString(),
  });
  return updated;
}

/** Fields to clear when pipeline state is fully snapshotted. */
const CLEAR_PIPELINE_STATE = {
  pipelineState: "idle" as const,
  currentMode: null,
  modeReason: null,
  profileData: [] as ProfileTable[],
  currentGoals: [] as Goal[],
  planSummary: "",
  planWarnings: [] as string[],
  planVersion: 0,
  planId: null,
  goalExecutions: [] as GoalExecution[],
  activeGoalId: null,
  reportMarkdown: null,
  reportSources: [] as string[],
  followupSuggestions: [] as string[],
  clarifyQuestions: [] as ClarifyQuestion[],
  awaitingConfirm: false,
};

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isStreaming: false,
  streamingContent: "",
  error: null,
  currentMode: null,
  modeReason: null,
  currentGoals: [],
  planVersion: 0,
  planId: null,
  planSummary: "",
  planWarnings: [],
  profileData: [],
  pipelineState: "idle",
  clarifyQuestions: [],
  awaitingConfirm: false,
  goalExecutions: [],
  activeGoalId: null,
  reportMarkdown: null,
  reportSources: [],
  followupSuggestions: [],
  sessionDataSourceIds: [],

  setSessionDataSourceIds: (ids) => set({ sessionDataSourceIds: ids }),

  loadMessages: async (sessionId: string) => {
    // Reset all pipeline state before loading new session
    set({
      messages: [],
      streamingContent: "",
      error: null,
      currentMode: null,
      modeReason: null,
      currentGoals: [],
      planVersion: 0,
      planId: null,
      planSummary: "",
      planWarnings: [],
      profileData: [],
      pipelineState: "idle",
      clarifyQuestions: [],
      awaitingConfirm: false,
      goalExecutions: [],
      activeGoalId: null,
      reportMarkdown: null,
      reportSources: [],
      followupSuggestions: [],
    });

    try {
      const res = await fetch(`/api/sessions/${sessionId}/messages`);
      const data = await res.json();
      if (data.success) {
        const messages = data.data as Message[];
        set({ messages, error: null });
        // Restore pipeline state from saved events
        restorePipelineState(messages, set);
      }
    } catch {
      set({ error: "Failed to load messages" });
    }
  },

  sendMessage: async (sessionId, content, onTitleSuggestion) => {
    // Prevent duplicate sends while streaming
    if (get().isStreaming) return;

    const userMessage: Message = {
      id: "temp-" + Date.now(),
      sessionId,
      role: "user",
      content,
      createdAt: new Date().toISOString(),
    };

    // Snapshot current pipeline state to last assistant message before clearing
    const prevState = get();
    const snapshot = captureSnapshot(prevState);

    set((state) => {
      let baseMessages = state.messages;
      if (snapshot) {
        baseMessages = attachSnapshotToMessages(baseMessages, snapshot, sessionId);
      }
      return {
        messages: [...baseMessages, userMessage],
        isStreaming: true,
        streamingContent: "",
        error: null,
        ...CLEAR_PIPELINE_STATE,
      };
    });

    abortController = new AbortController();

    // Build history from existing messages
    const history = get()
      .messages.filter((m) => m.role === "user" || m.role === "assistant")
      .slice(-10)
      .map((m) => ({ role: m.role, content: m.content }));

    const activities: AgentEvent[] = [];

    try {
      const dataSourceIds = get().sessionDataSourceIds;
      await streamChat({
        sessionId,
        message: content,
        history,
        dataSourceIds: dataSourceIds.length > 0 ? dataSourceIds : undefined,
        signal: abortController.signal,
        onEvent: (event) => {
          switch (event.type) {
            case "text":
              if (event.content) {
                set((state) => ({
                  streamingContent: state.streamingContent + event.content,
                }));
              }
              break;
            case "mode_info":
              set({ currentMode: event.mode || null, modeReason: event.reason || null });
              break;
            case "profiling_start":
              set({ pipelineState: "profiling" });
              break;
            case "profile_ready":
              set({
                profileData: (event.tables as ProfileTable[]) || [],
                pipelineState: "planning",
              });
              break;
            case "planning_start":
              set({ pipelineState: "planning" });
              break;
            case "plan_ready":
              set({
                currentGoals: event.goals || [],
                planVersion: event.version || 1,
                planSummary: event.summary || "",
                planWarnings: event.warnings || [],
                planId: event.planId || null,
                pipelineState: "waiting_confirm",
              });
              break;
            case "clarify_questions":
              set({
                clarifyQuestions:
                  (event.questions as ClarifyQuestion[]) || [],
                pipelineState: "clarifying",
              });
              break;
            case "plan_updated":
              set({
                currentGoals: event.goals || [],
                planVersion: event.version || 1,
                planSummary: event.summary || "",
                planId: event.planId || null,
              });
              break;
            case "confirm_required":
              set({
                awaitingConfirm: true,
                planId: event.planId || null,
                pipelineState: "waiting_confirm",
              });
              break;
            // Execution events (from quick mode inline execution)
            case "goal_start":
            case "code_generated":
            case "execution_start":
            case "execution_result":
            case "error_retry":
            case "reflection_failed":
            case "insight":
            case "chart":
              handleExecutionEvent(event, set, get);
              break;
            case "reporting_start":
              set({ pipelineState: "executing" });
              break;
            case "report_ready":
              set({
                reportMarkdown: event.markdown || null,
                reportSources: event.sources || [],
              });
              break;
            case "title_suggestion":
              if (event.title) {
                onTitleSuggestion?.(event.title);
              }
              break;
            case "followup_suggestions":
              if (event.suggestions) {
                set({ followupSuggestions: event.suggestions as string[] });
              }
              break;
            case "heartbeat":
              break;
            case "tool_call":
            case "tool_result":
              activities.push(event);
              break;
            case "error":
              set({ error: event.message || "Unknown error" });
              break;
            case "done":
              break;
          }
        },
        onDone: () => {
          const state = get();
          const hasText = !!state.streamingContent;
          const hasExecution = state.goalExecutions.length > 0;
          const hasPipeline = !!state.currentMode || state.currentGoals.length > 0;

          // Finalize any running goals
          const finalGoalExecs = hasExecution
            ? state.goalExecutions.map((g) =>
                g.status === "running" || g.status === "retrying"
                  ? { ...g, status: "error" as const, error: "执行流已结束，未收到结果" }
                  : g
              )
            : state.goalExecutions;

          const pipelineCompleted = hasExecution;

          // Build snapshot for this turn
          const turnSnapshot: ExecutionSnapshot | null =
            (hasPipeline || hasExecution)
              ? {
                  currentMode: state.currentMode,
                  modeReason: state.modeReason,
                  profileData: state.profileData,
                  currentGoals: state.currentGoals,
                  planSummary: state.planSummary,
                  planWarnings: state.planWarnings,
                  planVersion: state.planVersion,
                  planId: state.planId,
                  goalExecutions: finalGoalExecs,
                  reportMarkdown: state.reportMarkdown,
                  reportSources: state.reportSources,
                  followupSuggestions: state.followupSuggestions,
                  pipelineState: pipelineCompleted ? "completed" : state.pipelineState,
                }
              : null;

          if (hasText || turnSnapshot) {
            const assistantMessage: Message = {
              id: "msg-" + Date.now(),
              sessionId,
              role: "assistant",
              content: state.streamingContent || "",
              metadata: {
                ...(activities.length > 0 ? { activities } : {}),
                ...(turnSnapshot ? { executionSnapshot: turnSnapshot } : {}),
              },
              createdAt: new Date().toISOString(),
            };

            set((s) => ({
              messages: [...s.messages, assistantMessage],
              isStreaming: false,
              streamingContent: "",
              // If pipeline completed inline (Quick mode), clear global state
              ...(pipelineCompleted ? CLEAR_PIPELINE_STATE : {}),
            }));

            // Suggest title from first exchange
            if (hasText && get().messages.length <= 3 && onTitleSuggestion) {
              onTitleSuggestion(content.slice(0, 50));
            }
          } else {
            set({ isStreaming: false });
          }
        },
        onError: (err) => {
          set({ isStreaming: false, error: err.message });
        },
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        set({ isStreaming: false });
        return;
      }
      set({
        isStreaming: false,
        error: err instanceof Error ? err.message : "Stream failed",
      });
    }
  },

  stopStreaming: () => {
    abortController?.abort();
    const streamingContent = get().streamingContent;
    if (streamingContent) {
      const assistantMessage: Message = {
        id: "msg-stopped-" + Date.now(),
        sessionId: "",
        role: "assistant",
        content: streamingContent + "\n\n*(已停止)*",
        createdAt: new Date().toISOString(),
      };
      set((state) => ({
        messages: [...state.messages, assistantMessage],
        isStreaming: false,
        streamingContent: "",
      }));
    } else {
      set({ isStreaming: false });
    }
  },

  submitClarifyAnswers: async (sessionId, answers) => {
    // Get original user message for plan regeneration
    const messages = get().messages;
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
    const dsIds = get().sessionDataSourceIds;

    set({
      clarifyQuestions: [],
      pipelineState: "planning",
      isStreaming: true,
      error: null,
    });

    abortController = new AbortController();

    try {
      const res = await fetch(`/api/sessions/${sessionId}/clarify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answers,
          skipAll: false,
          message: lastUserMsg?.content || "",
          dataSourceIds: dsIds.length > 0 ? dsIds : undefined,
        }),
        signal: abortController.signal,
      });

      if (!res.ok) {
        set({ isStreaming: false, error: "提交澄清答案失败" });
        return;
      }

      // Consume SSE stream — will receive planning_start + plan_ready + confirm_required + done
      await consumeSSE(
        res,
        (event) => {
          switch (event.type) {
            case "planning_start":
              set({ pipelineState: "planning" });
              break;
            case "plan_ready":
              set({
                currentGoals: event.goals || [],
                planVersion: event.version || 1,
                planSummary: event.summary || "",
                planWarnings: event.warnings || [],
                planId: event.planId || null,
                pipelineState: "waiting_confirm",
              });
              break;
            case "plan_updated":
              set({
                currentGoals: event.goals || [],
                planVersion: event.version || 1,
                planSummary: event.summary || "",
                planId: event.planId || null,
              });
              break;
            case "confirm_required":
              set({
                awaitingConfirm: true,
                planId: event.planId || null,
                pipelineState: "waiting_confirm",
              });
              break;
            case "clarify_questions":
              // Plan regeneration may yield new clarify questions
              set({
                clarifyQuestions:
                  (event.questions as ClarifyQuestion[]) || [],
                pipelineState: "clarifying",
              });
              break;
            case "error":
              set({ error: event.message || "Unknown error" });
              break;
            case "done":
              break;
          }
        },
        abortController.signal
      );

      set({ isStreaming: false });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        set({ isStreaming: false });
        return;
      }
      set({
        isStreaming: false,
        error: err instanceof Error ? err.message : "提交澄清答案失败",
      });
    }
  },

  skipClarify: async (sessionId) => {
    try {
      const res = await fetch(`/api/sessions/${sessionId}/clarify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: {}, skipAll: true }),
      });
      const data = await res.json();
      set({
        clarifyQuestions: [],
        awaitingConfirm: true,
        pipelineState: "waiting_confirm",
        // Read planId from response if current state doesn't have one
        ...(data.planId && !get().planId ? { planId: data.planId } : {}),
      });
    } catch {
      set({ error: "跳过澄清失败" });
    }
  },

  confirmPlan: async (sessionId, planId) => {
    try {
      // 1. Confirm the plan
      const confirmRes = await fetch(`/api/sessions/${sessionId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      });
      const confirmData = await confirmRes.json();

      if (!confirmData.success) {
        set({ error: confirmData.error || "确认计划失败" });
        return;
      }

      // 2. Transition to executing state
      set({
        awaitingConfirm: false,
        pipelineState: "executing",
        isStreaming: true,
        goalExecutions: [],
        activeGoalId: null,
        error: null,
      });

      abortController = new AbortController();

      // 3. Start execution SSE stream
      const dsIds = get().sessionDataSourceIds;
      const execRes = await fetch(`/api/sessions/${sessionId}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId,
          dataSourceIds: dsIds.length > 0 ? dsIds : undefined,
        }),
        signal: abortController.signal,
      });

      if (!execRes.ok) {
        set({ isStreaming: false, error: "执行请求失败" });
        return;
      }

      // 4. Consume the SSE stream
      await consumeSSE(
        execRes,
        (event) => {
          handleExecutionEvent(event, set, get);
        },
        abortController.signal
      );

      // 5. Execution stream ended — mark running goals, snapshot, clear global
      set((state) => {
        const finalGoalExecs = state.goalExecutions.map((g) =>
          g.status === "running" || g.status === "retrying"
            ? { ...g, status: "error" as const, error: "执行流已结束，未收到结果" }
            : g
        );
        const snapshot: ExecutionSnapshot = {
          currentMode: state.currentMode,
          modeReason: state.modeReason,
          profileData: state.profileData,
          currentGoals: state.currentGoals,
          planSummary: state.planSummary,
          planWarnings: state.planWarnings,
          planVersion: state.planVersion,
          planId: state.planId,
          goalExecutions: finalGoalExecs,
          reportMarkdown: state.reportMarkdown,
          reportSources: state.reportSources,
          followupSuggestions: state.followupSuggestions,
          pipelineState: "completed",
        };
        const messages = attachSnapshotToMessages(
          [...state.messages],
          snapshot,
          sessionId
        );
        return {
          messages,
          isStreaming: false,
          ...CLEAR_PIPELINE_STATE,
          // Keep pipelineState as completed briefly for UI transition
          pipelineState: "completed" as const,
        };
      });
      // Clear pipelineState after snapshot is attached
      set({ pipelineState: "idle" });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        set({ isStreaming: false });
        return;
      }
      set({
        isStreaming: false,
        error: err instanceof Error ? err.message : "执行失败",
      });
    }
  },

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  modifyPlan: async (sessionId, _planId) => {
    const messages = get().messages;
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
    const dsIds = get().sessionDataSourceIds;

    set({
      awaitingConfirm: false,
      pipelineState: "planning",
      isStreaming: true,
      error: null,
    });

    abortController = new AbortController();

    try {
      const res = await fetch(`/api/sessions/${sessionId}/replan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: lastUserMsg?.content || "",
          dataSourceIds: dsIds.length > 0 ? dsIds : undefined,
        }),
        signal: abortController.signal,
      });

      if (!res.ok) {
        set({ isStreaming: false, error: "重新规划失败" });
        return;
      }

      await consumeSSE(
        res,
        (event) => {
          switch (event.type) {
            case "planning_start":
              set({ pipelineState: "planning" });
              break;
            case "plan_ready":
              set({
                currentGoals: event.goals || [],
                planVersion: event.version || 1,
                planSummary: event.summary || "",
                planWarnings: event.warnings || [],
                planId: event.planId || null,
                pipelineState: "waiting_confirm",
              });
              break;
            case "confirm_required":
              set({
                awaitingConfirm: true,
                planId: event.planId || null,
                pipelineState: "waiting_confirm",
              });
              break;
            case "clarify_questions":
              set({
                clarifyQuestions:
                  (event.questions as ClarifyQuestion[]) || [],
                pipelineState: "clarifying",
              });
              break;
            case "error":
              set({ error: event.message || "Unknown error" });
              break;
            case "done":
              break;
          }
        },
        abortController.signal
      );

      set({ isStreaming: false });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        set({ isStreaming: false });
        return;
      }
      set({
        isStreaming: false,
        error: err instanceof Error ? err.message : "重新规划失败",
      });
    }
  },

  clearChat: () =>
    set({
      messages: [],
      isStreaming: false,
      streamingContent: "",
      error: null,
      currentMode: null,
      modeReason: null,
      currentGoals: [],
      planVersion: 0,
      planId: null,
      planSummary: "",
      planWarnings: [],
      profileData: [],
      pipelineState: "idle",
      clarifyQuestions: [],
      awaitingConfirm: false,
      goalExecutions: [],
      activeGoalId: null,
      reportMarkdown: null,
      reportSources: [],
      followupSuggestions: [],
      sessionDataSourceIds: [],
    }),
}));

/** Centralized handler for execution-phase SSE events. */
function handleExecutionEvent(
  event: AgentEvent,
  set: (fn: Partial<ChatState> | ((s: ChatState) => Partial<ChatState>)) => void,
  get: () => ChatState
) {
  switch (event.type) {
    case "goal_start": {
      const exec: GoalExecution = {
        goalId: event.goalId || "",
        title: event.title || "",
        index: event.index ?? 0,
        total: event.total ?? 1,
        status: "running",
      };
      set((state) => ({
        pipelineState: "executing",
        activeGoalId: exec.goalId,
        goalExecutions: [
          ...state.goalExecutions.filter((g) => g.goalId !== exec.goalId),
          exec,
        ],
      }));
      break;
    }
    case "code_generated": {
      set((state) => ({
        goalExecutions: state.goalExecutions.map((g) =>
          g.goalId === event.goalId
            ? { ...g, code: event.code, codeType: event.codeType || "python" }
            : g
        ),
      }));
      break;
    }
    case "execution_start": {
      // No state change needed — goal is already "running"
      break;
    }
    case "execution_result": {
      set((state) => ({
        goalExecutions: state.goalExecutions.map((g) =>
          g.goalId === event.goalId
            ? {
                ...g,
                status: "success" as const,
                columns: event.columns,
                rows: event.rows,
                rowCount: event.rowCount,
              }
            : g
        ),
      }));
      break;
    }
    case "error_retry": {
      set((state) => ({
        goalExecutions: state.goalExecutions.map((g) =>
          g.goalId === event.goalId
            ? {
                ...g,
                status: "retrying" as const,
                error: event.error || event.message,
                attempt: event.attempt,
                maxAttempts: event.maxAttempts,
              }
            : g
        ),
      }));
      break;
    }
    case "reflection_failed": {
      set((state) => ({
        goalExecutions: state.goalExecutions.map((g) =>
          g.goalId === event.goalId
            ? { ...g, status: "retrying" as const, error: event.reason }
            : g
        ),
      }));
      break;
    }
    case "insight": {
      // event.text is where backend puts the insight (via "text" key in data)
      const insightText = event.text || event.content || "";
      set((state) => ({
        goalExecutions: state.goalExecutions.map((g) =>
          g.goalId === event.goalId ? { ...g, insight: insightText } : g
        ),
      }));
      break;
    }
    case "chart": {
      const url = event.option?.url as string | undefined;
      const interpretation = event.option?.interpretation as string | undefined;
      if (url) {
        set((state) => ({
          goalExecutions: state.goalExecutions.map((g) =>
            g.goalId === event.goalId
              ? {
                  ...g,
                  chartUrls: [...(g.chartUrls || []), url],
                  chartInterpretations: {
                    ...(g.chartInterpretations || {}),
                    ...(interpretation ? { [url]: interpretation } : {}),
                  },
                }
              : g
          ),
        }));
      }
      break;
    }
    case "reporting_start": {
      // Report generation started — keep executing state
      break;
    }
    case "report_ready": {
      set({
        reportMarkdown: event.markdown || null,
        reportSources: event.sources || [],
      });
      break;
    }
    case "error": {
      const goalId = event.goalId || get().activeGoalId;
      if (goalId) {
        set((state) => ({
          goalExecutions: state.goalExecutions.map((g) =>
            g.goalId === goalId
              ? { ...g, status: "error" as const, error: event.message }
              : g
          ),
        }));
      } else {
        set({ error: event.message || "Unknown error" });
      }
      break;
    }
    case "followup_suggestions": {
      set({ followupSuggestions: (event.suggestions as string[]) || [] });
      break;
    }
    case "done": {
      // Mark the pipeline as completed when execution stream finishes
      set({ pipelineState: "completed", isStreaming: false });
      break;
    }
  }
}

/** Build an ExecutionSnapshot from a list of pipeline events. */
export function buildSnapshotFromEvents(events: AgentEvent[]): ExecutionSnapshot | null {
  let currentMode: ExecutionSnapshot["currentMode"] = null;
  let modeReason: string | null = null;
  let currentGoals: Goal[] = [];
  let planVersion = 0;
  let planId: string | null = null;
  let planSummary = "";
  let planWarnings: string[] = [];
  let profileData: ProfileTable[] = [];
  let pipelineState = "idle";
  const goalExecutions: GoalExecution[] = [];
  let reportMarkdown: string | null = null;
  let reportSources: string[] = [];
  const followupSuggestions: string[] = [];

  for (const event of events) {
    switch (event.type) {
      case "mode_info":
        currentMode = event.mode || null;
        modeReason = event.reason || null;
        break;
      case "profile_ready":
        profileData = (event.tables as ProfileTable[]) || [];
        break;
      case "plan_ready":
        currentGoals = event.goals || [];
        planVersion = event.version || 1;
        planSummary = event.summary || "";
        planWarnings = event.warnings || [];
        planId = event.planId || null;
        pipelineState = "waiting_confirm";
        break;
      case "plan_updated":
        currentGoals = event.goals || [];
        planVersion = event.version || 1;
        planSummary = event.summary || "";
        planId = event.planId || null;
        break;
      case "confirm_required":
        planId = event.planId || null;
        pipelineState = "waiting_confirm";
        break;
      case "goal_start": {
        pipelineState = "executing";
        const exec: GoalExecution = {
          goalId: event.goalId || "",
          title: event.title || "",
          index: event.index ?? 0,
          total: event.total ?? 1,
          status: "running",
        };
        const existing = goalExecutions.findIndex((g) => g.goalId === exec.goalId);
        if (existing >= 0) goalExecutions[existing] = exec;
        else goalExecutions.push(exec);
        break;
      }
      case "code_generated": {
        const g = goalExecutions.find((g) => g.goalId === event.goalId);
        if (g) { g.code = event.code; g.codeType = event.codeType || "python"; }
        break;
      }
      case "execution_result": {
        const g = goalExecutions.find((g) => g.goalId === event.goalId);
        if (g) { g.status = "success"; g.columns = event.columns; g.rows = event.rows; g.rowCount = event.rowCount; }
        break;
      }
      case "insight": {
        const g = goalExecutions.find((g) => g.goalId === event.goalId);
        if (g) g.insight = event.text || event.content || "";
        break;
      }
      case "chart": {
        const url = event.option?.url as string | undefined;
        const interpretation = event.option?.interpretation as string | undefined;
        if (url) {
          const g = goalExecutions.find((g) => g.goalId === event.goalId);
          if (g) {
            g.chartUrls = [...(g.chartUrls || []), url];
            if (interpretation) g.chartInterpretations = { ...(g.chartInterpretations || {}), [url]: interpretation };
          }
        }
        break;
      }
      case "report_ready":
        reportMarkdown = event.markdown || null;
        reportSources = event.sources || [];
        break;
      case "followup_suggestions":
        if (event.suggestions) followupSuggestions.push(...(event.suggestions as string[]));
        break;
    }
  }

  if (!currentMode && currentGoals.length === 0 && goalExecutions.length === 0) return null;
  if (goalExecutions.length > 0) pipelineState = "completed";

  return {
    currentMode, modeReason, profileData, currentGoals,
    planSummary, planWarnings, planVersion, planId,
    goalExecutions: [...goalExecutions], reportMarkdown, reportSources,
    followupSuggestions, pipelineState,
  };
}

/** Restore pipeline state from saved message metadata (after session switch / reload). */
function restorePipelineState(
  messages: Message[],
  set: (fn: Partial<ChatState> | ((s: ChatState) => Partial<ChatState>)) => void
) {
  // Build per-message snapshots from pipelineEvents and attach to messages
  const updatedMessages = [...messages];
  let anySnapshotBuilt = false;

  for (let i = 0; i < updatedMessages.length; i++) {
    const msg = updatedMessages[i];
    if (msg.role !== "assistant") continue;
    const meta = msg.metadata as Record<string, unknown> | undefined;

    // Already has executionSnapshot — skip
    if (meta?.executionSnapshot) continue;

    // Build snapshot from pipelineEvents
    if (meta?.pipelineEvents && Array.isArray(meta.pipelineEvents)) {
      const snapshot = buildSnapshotFromEvents(meta.pipelineEvents as AgentEvent[]);
      if (snapshot) {
        updatedMessages[i] = {
          ...msg,
          metadata: { ...meta, executionSnapshot: snapshot },
        };
        anySnapshotBuilt = true;
      }
    }
  }

  if (anySnapshotBuilt) {
    set({ messages: updatedMessages });
  }

  // Find the last message with a snapshot to check if pipeline is still active
  let lastSnapshot: ExecutionSnapshot | null = null;
  let lastSnapshotIdx = -1;
  for (let i = updatedMessages.length - 1; i >= 0; i--) {
    const meta = updatedMessages[i].metadata as Record<string, unknown> | undefined;
    if (meta?.executionSnapshot) {
      lastSnapshot = meta.executionSnapshot as ExecutionSnapshot;
      lastSnapshotIdx = i;
      break;
    }
  }

  // If the last snapshot shows an in-progress pipeline, restore global state for interaction
  // and remove the snapshot from the message to avoid double-rendering (the global active
  // pipeline section will render it with interactive buttons instead).
  if (lastSnapshot && lastSnapshot.pipelineState === "waiting_confirm") {
    // Remove snapshot from last message — global state handles rendering
    const msg = updatedMessages[lastSnapshotIdx];
    const meta = msg.metadata as Record<string, unknown>;
    updatedMessages[lastSnapshotIdx] = {
      ...msg,
      metadata: { ...meta, executionSnapshot: undefined },
    };
    set({ messages: updatedMessages });

    set({
      currentMode: lastSnapshot.currentMode,
      modeReason: lastSnapshot.modeReason,
      currentGoals: lastSnapshot.currentGoals,
      planVersion: lastSnapshot.planVersion,
      planId: lastSnapshot.planId,
      planSummary: lastSnapshot.planSummary,
      planWarnings: lastSnapshot.planWarnings,
      profileData: lastSnapshot.profileData,
      pipelineState: "waiting_confirm",
      awaitingConfirm: true,
    });
  }
  // Otherwise, global state stays idle — historical turns render from their snapshots
}

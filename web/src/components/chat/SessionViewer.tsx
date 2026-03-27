"use client";

import { useEffect, useRef } from "react";
import { PanelHeader } from "@/components/shell/PanelHeader";
import { UserMessage } from "./UserMessage";
import { TurnCard } from "./TurnCard";
import { ChatInput } from "./ChatInput";
import { ModeIndicator } from "./ModeIndicator";
import { DataProfileCard } from "./DataProfileCard";
import { PlanCard } from "./PlanCard";
import { ClarifyCard } from "./ClarifyCard";
import { ExecutionPanel } from "./ExecutionPanel";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useChatStore } from "@/stores/chat-store";
import type { ExecutionSnapshot } from "@/stores/chat-store";
import { useSessionStore } from "@/stores/session-store";
import { useSourceStore } from "@/stores/source-store";
import { groupMessagesByTurn } from "@/lib/turn-utils";
// Turn type used via groupMessagesByTurn return
import { Sparkles, Loader2, MessageSquareMore } from "lucide-react";

export function SessionViewer() {
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const activeSession = useSessionStore((s) => s.getActiveSession());
  const updateSessionTitle = useSessionStore((s) => s.updateSessionTitle);
  const updateSessionInList = useSessionStore((s) => s.updateSessionInList);
  const {
    messages,
    isStreaming,
    streamingContent,
    loadMessages,
    sendMessage,
    currentMode,
    modeReason,
    profileData,
    currentGoals,
    planVersion,
    planSummary,
    planWarnings,
    planId,
    pipelineState,
    clarifyQuestions,
    awaitingConfirm,
    submitClarifyAnswers,
    skipClarify,
    confirmPlan,
    modifyPlan,
    goalExecutions,
    activeGoalId,
    reportMarkdown,
    followupSuggestions,
  } = useChatStore();
  const bottomRef = useRef<HTMLDivElement>(null);

  const setSessionDataSourceIds = useChatStore((s) => s.setSessionDataSourceIds);
  const fetchSources = useSourceStore((s) => s.fetchSources);

  useEffect(() => {
    if (activeSessionId) {
      loadMessages(activeSessionId);
      // Load session's data source bindings
      fetch(`/api/sessions/${activeSessionId}`)
        .then((r) => r.json())
        .then((d) => {
          if (d.success && d.data?.dataSourceIds) {
            setSessionDataSourceIds(d.data.dataSourceIds);
          }
        })
        .catch(() => {});
    }
  }, [activeSessionId, loadMessages, setSessionDataSourceIds]);

  // Ensure source list is loaded for badge display
  useEffect(() => {
    fetchSources();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent, pipelineState, profileData, currentGoals, clarifyQuestions, goalExecutions, reportMarkdown]);

  if (!activeSessionId) {
    return <EmptyState />;
  }

  const turns = groupMessagesByTurn(messages);

  const handleSend = async (content: string) => {
    if (!activeSessionId || isStreaming) return;
    await sendMessage(activeSessionId, content, (title) => {
      updateSessionTitle(activeSessionId, title);
      updateSessionInList(activeSessionId, {
        updatedAt: new Date().toISOString(),
      });
    });
    // Update session in list with latest time
    updateSessionInList(activeSessionId, {
      updatedAt: new Date().toISOString(),
    });
  };

  // Check if there's active (non-snapshotted) pipeline data to show globally
  const hasActivePipeline =
    isStreaming ||
    pipelineState !== "idle" ||
    currentGoals.length > 0 ||
    goalExecutions.length > 0;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <PanelHeader title={activeSession?.title || "新会话"} />

      {/* Messages */}
      <ScrollArea className="flex-1">
        <div className="max-w-[840px] mx-auto px-5 py-8 space-y-2.5">
          {turns.map((turn) => (
            <div key={turn.id} className="space-y-2.5">
              {turn.userMessage && (
                <UserMessage content={turn.userMessage.content} />
              )}
              {turn.assistantMessage && turn.assistantMessage.content && (
                <TurnCard
                  content={turn.assistantMessage.content}
                  activities={turn.activities}
                />
              )}
              {/* Historical pipeline results from snapshot */}
              {turn.executionSnapshot && (
                <HistoricalPipelineView
                  snapshot={turn.executionSnapshot}
                  onFollowup={handleSend}
                  isStreaming={isStreaming}
                />
              )}
            </div>
          ))}

          {/* Active pipeline stages — only for current (non-snapshotted) response */}
          {hasActivePipeline && (
            <>
              {/* Pipeline streaming stages */}
              {(isStreaming || currentMode || profileData.length > 0) && (
                <div className="space-y-3">
                  {/* Mode indicator */}
                  {currentMode && <ModeIndicator mode={currentMode} reason={modeReason ?? undefined} />}

                  {/* Profiling skeleton */}
                  {isStreaming && pipelineState === "profiling" && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-sm text-foreground-40">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        正在分析数据结构...
                      </div>
                      <SkeletonCard lines={3} />
                    </div>
                  )}

                  {/* Data profile */}
                  {profileData.length > 0 && (
                    <DataProfileCard tables={profileData} />
                  )}

                  {/* Planning skeleton */}
                  {isStreaming && pipelineState === "planning" && !currentGoals.length && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-sm text-foreground-40">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        正在生成分析计划...
                      </div>
                      <SkeletonCard lines={5} />
                    </div>
                  )}

                  {/* Streaming response */}
                  {streamingContent && (
                    <TurnCard content={streamingContent} isStreaming />
                  )}
                </div>
              )}

              {/* Plan card — shown after plan_ready */}
              {currentGoals.length > 0 && (
                <PlanCard
                  goals={currentGoals}
                  summary={planSummary}
                  warnings={planWarnings}
                  version={planVersion}
                  planId={planId || undefined}
                  showActions={awaitingConfirm && !!planId}
                  onConfirm={(pid) => activeSessionId && confirmPlan(activeSessionId, pid)}
                  onModify={(pid) => activeSessionId && modifyPlan(activeSessionId, pid)}
                  actionsDisabled={isStreaming}
                />
              )}

              {/* Clarify card */}
              {clarifyQuestions.length > 0 && activeSessionId && (
                <ClarifyCard
                  questions={clarifyQuestions}
                  onSubmit={(answers) =>
                    submitClarifyAnswers(activeSessionId, answers)
                  }
                  onSkip={() => skipClarify(activeSessionId)}
                  disabled={isStreaming}
                />
              )}

              {/* Execution waiting skeleton */}
              {isStreaming && pipelineState === "executing" && goalExecutions.length === 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-foreground-40">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    正在准备执行分析...
                  </div>
                  <SkeletonCard lines={4} />
                </div>
              )}

              {/* Execution progress */}
              {goalExecutions.length > 0 && (
                <ExecutionPanel
                  executions={goalExecutions}
                  activeGoalId={activeGoalId}
                  isStreaming={isStreaming}
                  reportMarkdown={reportMarkdown}
                />
              )}

              {/* Execution complete + followup suggestions (active pipeline) */}
              {pipelineState === "completed" && goalExecutions.length > 0 && !isStreaming && (
                <CompletedBanner
                  followupSuggestions={followupSuggestions}
                  onFollowup={handleSend}
                />
              )}
            </>
          )}

          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <ChatInput onSend={handleSend} isStreaming={isStreaming} />
    </div>
  );
}

/** Render a completed pipeline turn from its snapshot. */
function HistoricalPipelineView({
  snapshot,
  onFollowup,
  isStreaming,
}: {
  snapshot: ExecutionSnapshot;
  onFollowup: (content: string) => void;
  isStreaming?: boolean;
}) {
  return (
    <div className="space-y-2.5">
      {/* Mode indicator */}
      {snapshot.currentMode && (
        <ModeIndicator mode={snapshot.currentMode} reason={snapshot.modeReason ?? undefined} />
      )}

      {/* Plan card (static, no actions) */}
      {snapshot.currentGoals.length > 0 && (
        <PlanCard
          goals={snapshot.currentGoals}
          summary={snapshot.planSummary}
          warnings={snapshot.planWarnings}
          version={snapshot.planVersion}
          showActions={false}
          actionsDisabled={true}
        />
      )}

      {/* Execution panel with results */}
      {snapshot.goalExecutions.length > 0 && (
        <ExecutionPanel
          executions={snapshot.goalExecutions}
          activeGoalId={null}
          isStreaming={false}
          reportMarkdown={snapshot.reportMarkdown}
        />
      )}

      {/* Completed banner + followup suggestions */}
      {snapshot.pipelineState === "completed" && snapshot.goalExecutions.length > 0 && (
        <CompletedBanner
          followupSuggestions={snapshot.followupSuggestions}
          onFollowup={onFollowup}
          disabled={isStreaming}
        />
      )}
    </div>
  );
}

/** Green completion banner + follow-up suggestion buttons. */
function CompletedBanner({
  followupSuggestions,
  onFollowup,
  disabled,
}: {
  followupSuggestions: string[];
  onFollowup: (content: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-emerald-200 bg-emerald-50/50">
        <Sparkles className="w-4 h-4 text-emerald-500" />
        <span className="text-sm text-emerald-700">分析完成</span>
      </div>
      {followupSuggestions.length > 0 && (
        <div className="rounded-lg border border-foreground-8 bg-foreground-2 p-3 space-y-2">
          <div className="flex items-center gap-1.5 text-xs text-foreground-40">
            <MessageSquareMore className="w-3.5 h-3.5" />
            基于本次分析，你可以继续追问
          </div>
          <div className="flex flex-wrap gap-1.5">
            {followupSuggestions.map((s, i) => (
              <button
                key={i}
                onClick={() => !disabled && onFollowup(s)}
                disabled={disabled}
                className="text-xs px-2.5 py-1.5 rounded-full border border-accent/20 bg-accent/5 text-accent hover:bg-accent/10 transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-accent/5"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SkeletonCard({ lines = 3 }: { lines?: number }) {
  const widths = ["w-3/4", "w-full", "w-5/6", "w-2/3", "w-4/5"];
  return (
    <div className="rounded-xl border border-foreground-8 bg-white p-4 space-y-2.5 animate-pulse">
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className={`h-3 rounded bg-foreground-8 ${widths[i % widths.length]}`}
        />
      ))}
    </div>
  );
}

function EmptyState() {
  const createSession = useSessionStore((s) => s.createSession);
  const setActiveSession = useSessionStore((s) => s.setActiveSession);

  const examples = [
    { icon: "📊", title: "销售分析", desc: "各产品销售趋势与渠道对比", prompt: "请分析各产品的销售趋势和渠道对比" },
    { icon: "👥", title: "用户画像", desc: "用户分群与行为特征分析", prompt: "帮我分析用户画像和行为特征" },
    { icon: "📈", title: "趋势预测", desc: "关键指标时序趋势分析", prompt: "分析关键指标的变化趋势" },
    { icon: "🔍", title: "异常检测", desc: "数据质量与异常值排查", prompt: "帮我检测数据中的异常情况" },
  ];

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleExample = async (_prompt: string) => {
    try {
      const session = await createSession();
      setActiveSession(session.id);
    } catch {
      // ignore
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 text-foreground-40 px-6">
      <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-foreground-3">
        <Sparkles className="w-8 h-8 text-foreground-20" />
      </div>
      <div className="text-center">
        <p className="text-base font-semibold text-foreground-60">重明 Data Agent</p>
        <p className="text-sm text-foreground-30 mt-1">上传数据，提出问题，获取洞察</p>
      </div>
      <div className="grid grid-cols-2 gap-2.5 w-full max-w-md">
        {examples.map((ex) => (
          <button
            key={ex.title}
            onClick={() => handleExample(ex.prompt)}
            className="flex flex-col items-start gap-1 p-3 rounded-xl border border-foreground-8 bg-white hover:border-accent/30 hover:bg-accent/3 transition-all text-left group"
          >
            <span className="text-lg">{ex.icon}</span>
            <span className="text-sm font-medium text-foreground-60 group-hover:text-accent transition-colors">{ex.title}</span>
            <span className="text-xs text-foreground-30">{ex.desc}</span>
          </button>
        ))}
      </div>
      <p className="text-xs text-foreground-20">选择示例或新建会话，上传 CSV/Excel 开始分析</p>
    </div>
  );
}

"use client";

import { useState } from "react";
import { ClipboardList, AlertTriangle, Play, Edit3, CheckCircle2 } from "lucide-react";
import { PlanGoalItem } from "./PlanGoalItem";
import type { Goal } from "@/types/events";

interface PlanCardProps {
  goals: Goal[];
  summary?: string;
  warnings?: string[];
  version?: number;
  planId?: string;
  onGoalTitleChange?: (goalId: string, newTitle: string) => void;
  /** Show confirm/modify actions at the bottom of the card. */
  showActions?: boolean;
  onConfirm?: (planId: string) => void;
  onModify?: (planId: string) => void;
  actionsDisabled?: boolean;
}

export function PlanCard({
  goals,
  summary,
  warnings,
  version = 1,
  planId,
  onGoalTitleChange,
  showActions = false,
  onConfirm,
  onModify,
  actionsDisabled = false,
}: PlanCardProps) {
  const [confirmed, setConfirmed] = useState(false);

  if (!goals.length) return null;

  const handleConfirm = () => {
    if (!planId || !onConfirm) return;
    setConfirmed(true);
    onConfirm(planId);
  };

  return (
    <div className="border border-foreground-10 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-foreground-3 border-b border-foreground-10">
        <ClipboardList className="w-4 h-4 text-foreground-40" />
        <span className="text-sm font-medium text-foreground-70">
          分析计划
        </span>
        <span className="text-xs text-foreground-30">
          v{version} · {goals.length} 个目标
        </span>
      </div>

      {/* Summary */}
      {summary && (
        <div className="px-3 py-2 text-xs text-foreground-50 border-b border-foreground-5">
          {summary}
        </div>
      )}

      {/* Warnings */}
      {warnings && warnings.length > 0 && (
        <div className="px-3 py-2 space-y-1 border-b border-foreground-5 bg-amber-50/50">
          {warnings.map((w, i) => (
            <div
              key={i}
              className="flex items-center gap-1.5 text-xs text-amber-600"
            >
              <AlertTriangle className="w-3 h-3 shrink-0" />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}

      {/* Goals */}
      <div className="px-3 py-2">
        {goals.map((goal, i) => (
          <PlanGoalItem
            key={goal.id}
            goal={goal}
            index={i}
            onTitleChange={onGoalTitleChange}
          />
        ))}
      </div>

      {/* Confirm / Modify actions — integrated at card bottom */}
      {showActions && planId && (
        <div className="px-3 py-2.5 border-t border-foreground-5 bg-foreground-2">
          {confirmed ? (
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <span className="text-xs text-emerald-700">计划已确认，正在执行...</span>
            </div>
          ) : (
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => planId && onModify?.(planId)}
                disabled={actionsDisabled}
                className="flex items-center gap-1.5 text-xs text-foreground-50 hover:text-foreground-70 px-3 py-1.5 rounded-md border border-foreground-10 hover:bg-foreground-5 transition-colors disabled:opacity-50"
              >
                <Edit3 className="w-3.5 h-3.5" />
                修改计划
              </button>
              <button
                onClick={handleConfirm}
                disabled={actionsDisabled}
                className="flex items-center gap-1.5 text-xs text-white bg-accent hover:bg-accent/90 px-3 py-1.5 rounded-md transition-colors disabled:opacity-50"
              >
                <Play className="w-3.5 h-3.5" />
                确认执行
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

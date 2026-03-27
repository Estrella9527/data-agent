"use client";

import { useState } from "react";
import { Circle, CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import type { Goal } from "@/types/events";

interface PlanGoalItemProps {
  goal: Goal;
  index: number;
  onTitleChange?: (id: string, title: string) => void;
}

const STATUS_ICONS = {
  pending: Circle,
  running: Loader2,
  completed: CheckCircle2,
  failed: AlertCircle,
} as const;

export function PlanGoalItem({ goal, index, onTitleChange }: PlanGoalItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(goal.title);
  const status = (goal.status || "pending") as keyof typeof STATUS_ICONS;
  const Icon = STATUS_ICONS[status] || Circle;

  const handleSave = () => {
    setIsEditing(false);
    if (editTitle.trim() && editTitle !== goal.title) {
      onTitleChange?.(goal.id, editTitle.trim());
    }
  };

  return (
    <div className="flex items-start gap-2.5 py-1.5">
      <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
        <span className="text-xs text-foreground-30 w-5 text-right">
          {index + 1}.
        </span>
        <Icon
          className={`w-4 h-4 ${
            status === "completed"
              ? "text-emerald-500"
              : status === "running"
              ? "text-blue-500 animate-spin"
              : status === "failed"
              ? "text-red-500"
              : "text-foreground-20"
          }`}
        />
      </div>
      <div className="flex-1 min-w-0">
        {isEditing ? (
          <input
            className="w-full text-sm bg-foreground-3 border border-foreground-10 rounded px-2 py-0.5 outline-none focus:border-accent"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onBlur={handleSave}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
            autoFocus
          />
        ) : (
          <p
            className="text-sm text-foreground-70 cursor-pointer hover:text-foreground-90"
            onClick={() => onTitleChange && setIsEditing(true)}
          >
            {goal.title}
          </p>
        )}
        {goal.description && (
          <p className="text-xs text-foreground-40 mt-0.5">{goal.description}</p>
        )}
      </div>
    </div>
  );
}

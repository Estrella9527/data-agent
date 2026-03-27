"use client";

import { useState } from "react";
import { Play, Edit3, CheckCircle2 } from "lucide-react";

interface PlanConfirmBarProps {
  planId: string;
  onConfirm: (planId: string) => void;
  onModify: (planId: string) => void;
  disabled?: boolean;
}

export function PlanConfirmBar({
  planId,
  onConfirm,
  onModify,
  disabled = false,
}: PlanConfirmBarProps) {
  const [confirmed, setConfirmed] = useState(false);

  const handleConfirm = () => {
    setConfirmed(true);
    onConfirm(planId);
  };

  if (confirmed) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-emerald-200 bg-emerald-50/50">
        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
        <span className="text-sm text-emerald-700">计划已确认</span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <button
        onClick={() => onModify(planId)}
        disabled={disabled}
        className="flex items-center gap-1.5 text-xs text-foreground-50 hover:text-foreground-70 px-3 py-1.5 rounded-md border border-foreground-10 hover:bg-foreground-5 transition-colors disabled:opacity-50"
      >
        <Edit3 className="w-3.5 h-3.5" />
        修改计划
      </button>
      <button
        onClick={handleConfirm}
        disabled={disabled}
        className="flex items-center gap-1.5 text-xs text-white bg-accent hover:bg-accent/90 px-3 py-1.5 rounded-md transition-colors disabled:opacity-50"
      >
        <Play className="w-3.5 h-3.5" />
        确认执行
      </button>
    </div>
  );
}

"use client";

import { Zap, BarChart3, Microscope } from "lucide-react";

const MODE_CONFIG = {
  quick: {
    label: "问数模式",
    icon: Zap,
    color: "text-blue-600 bg-blue-50 border-blue-200",
  },
  standard: {
    label: "标准分析",
    icon: BarChart3,
    color: "text-emerald-600 bg-emerald-50 border-emerald-200",
  },
  deep: {
    label: "深度探索",
    icon: Microscope,
    color: "text-purple-600 bg-purple-50 border-purple-200",
  },
} as const;

interface ModeIndicatorProps {
  mode: "quick" | "standard" | "deep";
  reason?: string;
}

export function ModeIndicator({ mode, reason }: ModeIndicatorProps) {
  const config = MODE_CONFIG[mode];
  const Icon = config.icon;

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${config.color}`}
    >
      <Icon className="w-3.5 h-3.5" />
      <span>{config.label}</span>
      {reason && (
        <span className="text-[10px] opacity-60 ml-1">— {reason}</span>
      )}
    </div>
  );
}

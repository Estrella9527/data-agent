"use client";

import { Wrench } from "lucide-react";
import type { AgentEvent } from "@/types/events";

interface ActivityRowProps {
  event: AgentEvent;
}

export function ActivityRow({ event }: ActivityRowProps) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-inner bg-foreground-2 text-xs text-foreground-50">
      <Wrench className="w-3 h-3 flex-shrink-0" />
      <span className="truncate">
        调用工具: {event.name || "unknown"}
      </span>
    </div>
  );
}

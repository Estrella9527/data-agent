"use client";

import { ResponseCard } from "./ResponseCard";
import { ActivityRow } from "./ActivityRow";
import type { AgentEvent } from "@/types/events";

interface TurnCardProps {
  content: string;
  activities?: AgentEvent[];
  isStreaming?: boolean;
}

export function TurnCard({ content, activities = [], isStreaming }: TurnCardProps) {
  const toolCalls = activities.filter((a) => a.type === "tool_call");

  return (
    <div className="space-y-1.5">
      {/* Activities (tool calls) — collapsible in future */}
      {toolCalls.length > 0 && (
        <div className="space-y-1">
          {toolCalls.map((activity, i) => (
            <ActivityRow key={i} event={activity} />
          ))}
        </div>
      )}

      {/* Response */}
      <ResponseCard content={content} isStreaming={isStreaming} />
    </div>
  );
}

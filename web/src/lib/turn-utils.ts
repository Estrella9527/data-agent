/**
 * Turn grouping utilities — groups messages into conversation turns.
 * Inspired by Craft Agents turn-based rendering.
 */

import type { Message } from "@/types/session";
import type { AgentEvent } from "@/types/events";
import type { ExecutionSnapshot } from "@/stores/chat-store";
import { buildSnapshotFromEvents } from "@/stores/chat-store";

export interface Turn {
  id: string;
  userMessage: Message | null;
  assistantMessage: Message | null;
  activities: AgentEvent[];
  executionSnapshot?: ExecutionSnapshot | null;
  streamingContent?: string;
  isStreaming?: boolean;
}

/**
 * Merge multiple assistant messages into a single virtual message.
 * - content: concatenate non-empty contents with \n\n
 * - metadata.pipelineEvents: concatenate all events arrays
 * - metadata.executionSnapshot: rebuild from merged events (not pick from fragments)
 */
function mergeAssistantMessages(msgs: Message[]): Message {
  if (msgs.length === 1) return msgs[0];

  const mergedContent = msgs
    .map((m) => m.content)
    .filter((c) => c && c.trim())
    .join("\n\n");

  let mergedEvents: Record<string, unknown>[] = [];
  let mergedActivities: unknown[] = [];

  for (const m of msgs) {
    const meta = m.metadata as Record<string, unknown> | undefined;
    if (!meta) continue;
    if (Array.isArray(meta.pipelineEvents)) {
      mergedEvents = [...mergedEvents, ...meta.pipelineEvents as Record<string, unknown>[]];
    }
    if (Array.isArray(meta.activities)) {
      mergedActivities = [...mergedActivities, ...meta.activities as unknown[]];
    }
  }

  // Rebuild snapshot from all merged events instead of picking a fragment
  const mergedSnapshot = mergedEvents.length > 0
    ? buildSnapshotFromEvents(mergedEvents as unknown as AgentEvent[])
    : null;

  return {
    ...msgs[0],
    content: mergedContent,
    metadata: {
      ...(msgs[0].metadata as Record<string, unknown> | undefined),
      pipelineEvents: mergedEvents,
      executionSnapshot: mergedSnapshot,
      activities: mergedActivities.length > 0 ? mergedActivities : undefined,
    },
  };
}

/**
 * Group messages into turns: [user, assistant*] pairs.
 * After a user message, greedily collects all consecutive assistant messages
 * and merges them into one virtual assistant message.
 */
export function groupMessagesByTurn(messages: Message[]): Turn[] {
  const turns: Turn[] = [];
  let i = 0;

  while (i < messages.length) {
    const msg = messages[i];

    if (msg.role === "user") {
      const turn: Turn = {
        id: msg.id,
        userMessage: msg,
        assistantMessage: null,
        activities: [],
        executionSnapshot: null,
      };

      // Greedily collect all consecutive assistant messages after this user message
      const assistantMsgs: Message[] = [];
      let nextIdx = i + 1;
      while (nextIdx < messages.length && messages[nextIdx].role === "assistant") {
        assistantMsgs.push(messages[nextIdx]);
        nextIdx++;
      }

      if (assistantMsgs.length > 0) {
        const merged = mergeAssistantMessages(assistantMsgs);
        turn.assistantMessage = merged;

        const meta = merged.metadata as Record<string, unknown> | undefined;
        if (meta) {
          if (Array.isArray(meta.activities)) {
            turn.activities = meta.activities as AgentEvent[];
          }
          if (meta.executionSnapshot) {
            turn.executionSnapshot = meta.executionSnapshot as ExecutionSnapshot;
          }
        }
        i = nextIdx;
      } else {
        i += 1;
      }

      turns.push(turn);
    } else if (msg.role === "assistant") {
      // Standalone assistant message(s) not preceded by a user message
      // Greedily collect consecutive assistant messages
      const assistantMsgs: Message[] = [msg];
      let nextIdx = i + 1;
      while (nextIdx < messages.length && messages[nextIdx].role === "assistant") {
        assistantMsgs.push(messages[nextIdx]);
        nextIdx++;
      }

      const merged = mergeAssistantMessages(assistantMsgs);
      const meta = merged.metadata as Record<string, unknown> | undefined;
      turns.push({
        id: merged.id,
        userMessage: null,
        assistantMessage: merged,
        activities: [],
        executionSnapshot: meta?.executionSnapshot
          ? (meta.executionSnapshot as ExecutionSnapshot)
          : null,
      });
      i = nextIdx;
    } else {
      i += 1;
    }
  }

  return turns;
}

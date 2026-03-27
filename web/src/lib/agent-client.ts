/**
 * SSE client for the agent backend.
 * Parses the SSE stream and calls event handlers.
 * Includes heartbeat timeout detection and retry with exponential backoff.
 */

import type { AgentEvent } from "@/types/events";

/** Heartbeat timeout — if no data received for this long, consider connection dead. */
const HEARTBEAT_TIMEOUT_MS = 60_000;
/** Retry delays in ms (exponential backoff). */
const RETRY_DELAYS = [1000, 3000, 5000];
const MAX_RETRIES = RETRY_DELAYS.length;

export interface StreamOptions {
  sessionId: string;
  message: string;
  history?: { role: string; content: string }[];
  dataSourceIds?: string[];
  tableSchemas?: Record<string, unknown>[];
  mode?: "quick" | "standard" | "deep";
  onEvent: (event: AgentEvent) => void;
  onError?: (error: Error) => void;
  onDone?: () => void;
  signal?: AbortSignal;
}

export async function streamChat(options: StreamOptions): Promise<void> {
  const { sessionId, message, history, dataSourceIds, tableSchemas, mode, onEvent, onError, onDone, signal } = options;

  let attempt = 0;

  while (attempt <= MAX_RETRIES) {
    try {
      const completed = await attemptStream(
        { sessionId, message, history, dataSourceIds, tableSchemas, mode },
        onEvent,
        onDone,
        signal
      );
      if (completed) return; // Normal completion
      // If not completed (timeout), fall through to retry
    } catch (err) {
      if (signal?.aborted) throw err;
      if (attempt >= MAX_RETRIES) {
        onError?.(err instanceof Error ? err : new Error("Stream failed after retries"));
        throw err;
      }
    }

    attempt++;
    if (attempt <= MAX_RETRIES) {
      const delay = RETRY_DELAYS[attempt - 1];
      await new Promise((resolve) => setTimeout(resolve, delay));
      if (signal?.aborted) return;
    }
  }

  onDone?.();
}

/** Single stream attempt. Returns true if completed normally, false if timed out. */
async function attemptStream(
  payload: {
    sessionId: string;
    message: string;
    history?: { role: string; content: string }[];
    dataSourceIds?: string[];
    tableSchemas?: Record<string, unknown>[];
    mode?: "quick" | "standard" | "deep";
  },
  onEvent: (event: AgentEvent) => void,
  onDone?: () => void,
  signal?: AbortSignal
): Promise<boolean> {
  const response = await fetch("/api/chat/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    throw new Error(errBody.error?.message || `Stream failed: ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";
  let heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
  let timedOut = false;

  const resetHeartbeat = () => {
    if (heartbeatTimer) clearTimeout(heartbeatTimer);
    heartbeatTimer = setTimeout(() => {
      timedOut = true;
      reader.cancel().catch(() => {});
    }, HEARTBEAT_TIMEOUT_MS);
  };

  try {
    resetHeartbeat();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (timedOut) return false;

      resetHeartbeat();
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6);

        if (data === "[DONE]") {
          onDone?.();
          return true;
        }

        try {
          const event: AgentEvent = JSON.parse(data);
          onEvent(event);
        } catch {
          // Skip invalid JSON
        }
      }
    }
  } finally {
    if (heartbeatTimer) clearTimeout(heartbeatTimer);
    reader.releaseLock();
  }

  if (timedOut) return false;
  onDone?.();
  return true;
}

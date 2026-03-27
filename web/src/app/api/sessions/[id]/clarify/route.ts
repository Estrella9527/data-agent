import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";

const BACKEND_URL = process.env.AGENT_SERVICE_URL || "http://localhost:8010";

const PIPELINE_EVENT_TYPES = new Set([
  "mode_info", "profile_ready", "plan_ready", "confirm_required",
  "plan_updated", "clarify_questions",
]);

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();
    const sessionId = params.id;

    const res = await fetch(
      `${BACKEND_URL}/api/sessions/${sessionId}/clarify`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );

    // skipAll returns JSON directly
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const data = await res.json();
      return NextResponse.json(data);
    }

    // SSE stream — pass through while collecting pipeline events
    const reader = res.body?.getReader();
    if (!reader) {
      return NextResponse.json(
        { success: false, error: "No response body" },
        { status: 502 }
      );
    }

    const pipelineEvents: Record<string, unknown>[] = [];
    const decoder = new TextDecoder();

    const stream = new ReadableStream({
      async pull(controller) {
        try {
          const { done, value } = await reader.read();
          if (done) {
            // Append pipeline events to the last assistant message (avoid fragmenting turns)
            if (pipelineEvents.length > 0) {
              const lastAssistant = await prisma.message.findFirst({
                where: { sessionId, role: "assistant" },
                orderBy: { createdAt: "desc" },
              });

              if (lastAssistant) {
                const existingMeta = (lastAssistant.metadata as Record<string, unknown>) || {};
                const existingEvents = Array.isArray(existingMeta.pipelineEvents)
                  ? (existingMeta.pipelineEvents as Record<string, unknown>[])
                  : [];
                await prisma.message.update({
                  where: { id: lastAssistant.id },
                  data: {
                    metadata: {
                      ...existingMeta,
                      pipelineEvents: [...existingEvents, ...pipelineEvents],
                    } as unknown as Prisma.InputJsonValue,
                  },
                });
              } else {
                // Fallback: no existing assistant message yet
                await prisma.message.create({
                  data: {
                    sessionId,
                    role: "assistant",
                    content: "",
                    metadata: { pipelineEvents } as unknown as Prisma.InputJsonValue,
                  },
                });
              }
              await prisma.session.update({
                where: { id: sessionId },
                data: { updatedAt: new Date() },
              });
            }
            controller.close();
            return;
          }

          // Parse SSE to collect pipeline events
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n");
          for (const line of lines) {
            if (line.startsWith("data: ") && line.slice(6) !== "[DONE]") {
              try {
                const event = JSON.parse(line.slice(6));
                if (PIPELINE_EVENT_TYPES.has(event.type)) {
                  pipelineEvents.push(event);
                }
              } catch {
                // skip
              }
            }
          }

          controller.enqueue(value);
        } catch (err) {
          controller.error(err);
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to submit clarification" },
      { status: 500 }
    );
  }
}

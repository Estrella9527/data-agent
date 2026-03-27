import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";

const AGENT_SERVICE_URL =
  process.env.AGENT_SERVICE_URL || "http://localhost:8010";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sessionId, message, history, dataSourceIds, tableSchemas, mode } = body;

    // Save user message to DB
    await prisma.message.create({
      data: {
        sessionId,
        role: "user",
        content: message,
      },
    });

    // Forward to agent service
    const agentResponse = await fetch(`${AGENT_SERVICE_URL}/api/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        message,
        history,
        dataSourceIds,
        tableSchemas,
        mode,
      }),
    });

    if (!agentResponse.ok) {
      return new Response(
        JSON.stringify({
          error: { message: "Agent service error" },
        }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    // Collect streaming response to also save to DB
    const reader = agentResponse.body?.getReader();
    if (!reader) {
      return new Response("No response body", { status: 502 });
    }

    let fullContent = "";
    const pipelineEvents: Record<string, unknown>[] = [];
    const PIPELINE_EVENT_TYPES = new Set([
      "mode_info", "profile_ready", "plan_ready", "confirm_required",
      "plan_updated", "clarify_questions", "goal_start", "code_generated",
      "execution_result", "insight", "chart", "report_ready",
      "title_suggestion", "followup_suggestions",
    ]);
    const decoder = new TextDecoder();

    const stream = new ReadableStream({
      async pull(controller) {
        try {
          const { done, value } = await reader.read();
          if (done) {
            // Save assistant message with pipeline events
            if (fullContent || pipelineEvents.length > 0) {
              await prisma.message.create({
                data: {
                  sessionId,
                  role: "assistant",
                  content: fullContent,
                  metadata:
                    pipelineEvents.length > 0
                      ? ({ pipelineEvents } as unknown as Prisma.InputJsonValue)
                      : undefined,
                },
              });
              // Update session timestamp
              await prisma.session.update({
                where: { id: sessionId },
                data: { updatedAt: new Date() },
              });
            }
            controller.close();
            return;
          }

          // Parse SSE data to accumulate text content and pipeline events
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n");
          for (const line of lines) {
            if (line.startsWith("data: ") && line.slice(6) !== "[DONE]") {
              try {
                const event = JSON.parse(line.slice(6));
                if (event.type === "text" && event.content) {
                  fullContent += event.content;
                }
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
  } catch (error) {
    console.error("Chat stream error:", error);
    return new Response(
      JSON.stringify({ error: { message: "Internal server error" } }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

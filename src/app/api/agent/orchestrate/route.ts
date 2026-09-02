import { z } from "zod";
import { runAgent } from "@/lib/agent/orchestrator";
import { friendlyLLMError } from "@/lib/llm";
import { requireTenantContext } from "@/lib/tenant";
import { requirePipelineWrite } from "@/lib/auth/permissions";
import { handleApiError } from "@/lib/api-errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  prompt: z.string().trim().min(1, "prompt is required").max(4000),
  session_id: z.string().trim().min(1).max(128).optional(),
  sessionId: z.string().trim().min(1).max(128).optional(),
  leadId: z.string().uuid().optional(),
});

function encodeEvent(event: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
}

export async function POST(req: Request): Promise<Response> {
  try {
    const ctx = await requireTenantContext();
    requirePipelineWrite(ctx);
    const rawBody: unknown = await req.json().catch(() => null);
    const parsed = requestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid request" },
        { status: 400 },
      );
    }

    const sessionId = parsed.data.session_id ?? parsed.data.sessionId;
    if (!sessionId) {
      return Response.json({ error: "session_id is required" }, { status: 400 });
    }

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const event of runAgent({
            ctx,
            sessionId,
            prompt: parsed.data.prompt,
            leadId: parsed.data.leadId,
            signal: req.signal,
          })) {
            controller.enqueue(encodeEvent(event));
          }
        } catch (error) {
          controller.enqueue(encodeEvent({ type: "error", message: friendlyLLMError(error) }));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    return handleApiError(error, "[api/agent/orchestrate]");
  }
}

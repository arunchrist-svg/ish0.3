import { runWriter } from "@/lib/agents/writer";
import { db, leads, leadOutreach } from "@/db";
import { eq } from "drizzle-orm";
import { friendlyLLMError } from "@/lib/llm";
import { getOutreachTemplate, type OutreachTemplateId } from "@/lib/email/outreach-templates";
import { toWriterDraft } from "@/lib/agents/writer-draft";
import { requireTenantContext } from "@/lib/tenant";
import { assertCredits, deductCredits } from "@/lib/billing/credits";
import { checkLowBalanceAlerts } from "@/lib/billing/analytics";
import { requirePipelineWrite } from "@/lib/auth/permissions";
import { ResearchNotReadyError } from "@/lib/agents/writer-plan";

function sse(data: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`);
}

export async function POST(req: Request) {
  try {
    const ctx = await requireTenantContext();
    requirePipelineWrite(ctx);
    const { leadId, outreachTemplate } = await req.json();
    if (!leadId) {
      return new Response(JSON.stringify({ error: "leadId required" }), { status: 400 });
    }

    const [lead] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
    if (!lead || lead.tenantId !== ctx.tenantId) {
      return new Response(JSON.stringify({ error: "Lead not found" }), { status: 404 });
    }

    const stream = new ReadableStream({
      async start(controller) {
        const send = (payload: Record<string, unknown>) => controller.enqueue(sse(payload));
        try {
          send({ type: "progress", message: "Loading lead context..." });
          await assertCredits(ctx.tenantId, "writer.draft", 1);
          send({ type: "progress", message: "Drafting email with AI..." });

          const template = getOutreachTemplate(outreachTemplate as OutreachTemplateId | undefined);
          const outreachId = await runWriter(leadId, { outreachTemplate: template.id });

          send({ type: "progress", message: "Scoring deliverability..." });
          await deductCredits({ tenantId: ctx.tenantId, action: "writer.draft", referenceId: outreachId });
          void checkLowBalanceAlerts(ctx.tenantId);

          const draft = await db.query.leadOutreach.findFirst({ where: eq(leadOutreach.id, outreachId) });
          if (!draft) {
            send({ type: "error", message: "Draft not found after write" });
            controller.close();
            return;
          }

          send({ type: "complete", draft: toWriterDraft(draft) });
        } catch (e) {
          if (e instanceof ResearchNotReadyError) {
            send({ type: "error", code: e.code, message: e.message, missing: e.missing });
          } else {
            send({ type: "error", message: friendlyLLMError(e) });
          }
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (e) {
    if (e instanceof ResearchNotReadyError) {
      return new Response(JSON.stringify({ code: e.code, error: e.message }), { status: 422 });
    }
    return new Response(JSON.stringify({ error: friendlyLLMError(e) }), { status: 500 });
  }
}

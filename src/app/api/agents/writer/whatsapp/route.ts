import { NextResponse } from "next/server";
import { db, leadOutreach, leads } from "@/db";
import { eq } from "drizzle-orm";
import { runWhatsAppWriter } from "@/lib/agents/writer-whatsapp";
import { toWriterDraft } from "@/lib/agents/writer-draft";
import { requireTenantContext } from "@/lib/tenant";
import { assertCredits, deductCredits } from "@/lib/billing/credits";
import { checkLowBalanceAlerts } from "@/lib/billing/analytics";
import { handleApiError } from "@/lib/api-errors";
import { requirePipelineWrite } from "@/lib/auth/permissions";
import { friendlyLLMError, llmErrorHttpStatus } from "@/lib/llm";
import { ResearchNotReadyError } from "@/lib/agents/writer-plan";
import {
  WhatsAppMobileRequiredError,
  WhatsAppNotConnectedError,
} from "@/lib/whatsapp/errors";

export async function POST(req: Request) {
  try {
    const ctx = await requireTenantContext();
    requirePipelineWrite(ctx);
    const { leadId } = await req.json();
    if (!leadId) return NextResponse.json({ error: "leadId required" }, { status: 400 });

    const [lead] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
    if (!lead || lead.tenantId !== ctx.tenantId) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    await assertCredits(ctx.tenantId, "writer.draft", 1);
    const outreachId = await runWhatsAppWriter(leadId);
    await deductCredits({ tenantId: ctx.tenantId, action: "writer.draft", referenceId: outreachId });
    void checkLowBalanceAlerts(ctx.tenantId);

    const draft = await db.query.leadOutreach.findFirst({ where: eq(leadOutreach.id, outreachId) });
    if (!draft) return NextResponse.json({ error: "Draft not found after write" }, { status: 500 });

    return NextResponse.json({ draft: toWriterDraft(draft) });
  } catch (e) {
    if (e instanceof WhatsAppNotConnectedError || e instanceof WhatsAppMobileRequiredError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: 400 });
    }
    if (e instanceof ResearchNotReadyError) {
      return NextResponse.json({ code: e.code, error: e.message, missing: e.missing }, { status: 422 });
    }
    const errRes = handleApiError(e, "[api/agents/writer/whatsapp]");
    if (errRes.status !== 500) return errRes;
    return NextResponse.json({ error: friendlyLLMError(e) }, { status: llmErrorHttpStatus(e) });
  }
}

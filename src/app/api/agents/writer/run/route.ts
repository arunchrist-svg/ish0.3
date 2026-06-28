import { NextResponse } from "next/server";
import { runWriter } from "@/lib/agents/writer";
import { runWriterSequence, regenerateSequenceStep } from "@/lib/agents/writer-sequence";
import { db, leadOutreach, leads } from "@/db";
import { eq } from "drizzle-orm";
import { friendlyLLMError } from "@/lib/llm";
import { getOutreachTemplate, type OutreachTemplateId } from "@/lib/email/outreach-templates";
import { toWriterDraft } from "@/lib/agents/writer-draft";
import { requireTenantContext } from "@/lib/tenant";
import { assertCredits, deductCredits } from "@/lib/billing/credits";
import { checkLowBalanceAlerts } from "@/lib/billing/analytics";
import { handleApiError } from "@/lib/api-errors";
import { requirePipelineWrite } from "@/lib/auth/permissions";

export async function POST(req: Request) {
  try {
    const ctx = await requireTenantContext();
    requirePipelineWrite(ctx);
    const { leadId, outreachTemplate, mode, sequencePosition } = await req.json();
    if (!leadId) return NextResponse.json({ error: "leadId required" }, { status: 400 });

    const [lead] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
    if (!lead || lead.tenantId !== ctx.tenantId) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }


    if (mode === "single" && sequencePosition && [2, 3].includes(sequencePosition)) {
      await assertCredits(ctx.tenantId, "writer.draft", 1);
      const template = getOutreachTemplate(outreachTemplate as OutreachTemplateId | undefined);
      const outreachId = await regenerateSequenceStep(leadId, sequencePosition as 2 | 3, {
        outreachTemplate: template.id,
      });
      await deductCredits({ tenantId: ctx.tenantId, action: "writer.draft", referenceId: outreachId });
      void checkLowBalanceAlerts(ctx.tenantId);
      const draft = await db.query.leadOutreach.findFirst({ where: eq(leadOutreach.id, outreachId) });
      if (!draft) return NextResponse.json({ error: "Draft not found after write" }, { status: 500 });
      return NextResponse.json({ draft: toWriterDraft(draft, { sequencePosition: draft.sequencePosition ?? undefined }) });
    }

    const template = getOutreachTemplate(outreachTemplate as OutreachTemplateId | undefined);
    const useSequence = mode !== "single";

    if (useSequence) {
      await assertCredits(ctx.tenantId, "writer.draft", 3);
      const ids = await runWriterSequence(leadId, { outreachTemplate: template.id });
      for (const id of ids) {
        await deductCredits({ tenantId: ctx.tenantId, action: "writer.draft", referenceId: id });
      }
      void checkLowBalanceAlerts(ctx.tenantId);

      const rows = await db.query.leadOutreach.findMany({
        where: eq(leadOutreach.leadId, leadId),
        orderBy: (t, { asc }) => [asc(t.sequencePosition)],
      });
      const sequenceRows = rows.filter((r) => r.sequencePosition != null);
      const drafts = sequenceRows.map((d) => toWriterDraft(d, { sequencePosition: d.sequencePosition ?? undefined }));
      return NextResponse.json({ drafts, draft: drafts[0] });
    }

    await assertCredits(ctx.tenantId, "writer.draft", 1);
    const outreachId = await runWriter(leadId, { outreachTemplate: template.id });
    await deductCredits({ tenantId: ctx.tenantId, action: "writer.draft", referenceId: outreachId });
    void checkLowBalanceAlerts(ctx.tenantId);

    const draft = await db.query.leadOutreach.findFirst({ where: eq(leadOutreach.id, outreachId) });
    if (!draft) return NextResponse.json({ error: "Draft not found after write" }, { status: 500 });

    return NextResponse.json({ draft: toWriterDraft(draft) });
  } catch (e) {
    const errRes = handleApiError(e, "[api/agents/writer/run]");
    if (errRes.status !== 500) return errRes;
    return NextResponse.json({ error: friendlyLLMError(e) }, { status: 500 });
  }
}

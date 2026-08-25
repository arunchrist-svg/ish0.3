import { NextResponse } from "next/server";
import { resolveWriterMode, runWriter } from "@/lib/agents/writer";
import { runWriterSequence, regenerateSequenceStep } from "@/lib/agents/writer-sequence";
import { db, leadOutreach, leads, accounts } from "@/db";
import { eq } from "drizzle-orm";
import { friendlyLLMError, llmErrorHttpStatus } from "@/lib/llm";
import type { OutreachTemplateId } from "@/lib/email/outreach-templates";
import { toWriterDraft } from "@/lib/agents/writer-draft";
import { requireTenantContext } from "@/lib/tenant";
import { assertCredits, deductCredits } from "@/lib/billing/credits";
import { checkLowBalanceAlerts } from "@/lib/billing/analytics";
import { handleApiError } from "@/lib/api-errors";
import { requirePipelineWrite } from "@/lib/auth/permissions";
import { ResearchNotReadyError } from "@/lib/agents/writer-plan";
import { getResolvedEmailConfig } from "@/lib/settings/email-settings";
import { resolveWriteOccasion } from "@/lib/occasions/resolve";
import { FESTIVE_OCCASION_SENTINEL } from "@/lib/occasions/catalog";
import { prepareLeadForOccasionWrite } from "@/lib/outreach/prepare-occasion-write";
import type { CompanyOverview } from "@/lib/company-overview";

export async function POST(req: Request) {
  try {
    const ctx = await requireTenantContext();
    requirePipelineWrite(ctx);
    const { leadId, outreachTemplate, mode, sequencePosition, writerMode, occasionTheme, async: asyncMode } =
      await req.json();
    const resolvedWriterMode = resolveWriterMode(writerMode);
    if (!leadId) return NextResponse.json({ error: "leadId required" }, { status: 400 });

    const [lead] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
    if (!lead || lead.tenantId !== ctx.tenantId) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    if (asyncMode === true) {
      const { enqueueWriterRun } = await import("@/lib/jobs/enqueue");
      const status = await enqueueWriterRun({
        leadId,
        tenantId: ctx.tenantId,
        mode: mode === "single" ? "single" : "sequence",
        outreachTemplate,
        writerMode: resolvedWriterMode,
        occasionTheme,
      });
      return NextResponse.json({ ok: true, queued: status === "queued", leadId });
    }

    const emailConfig = await getResolvedEmailConfig(lead.workspaceId, lead.createdByUserId || undefined);
    const [account] = await db.select().from(accounts).where(eq(accounts.id, lead.accountId)).limit(1);
    const occasionId =
      resolveWriteOccasion({
        selected: occasionTheme,
        overview: (account?.companyOverview as CompanyOverview | null) ?? null,
        campaignMode: emailConfig.campaignMode,
      }) ?? FESTIVE_OCCASION_SENTINEL;
    if (mode !== "single") {
      await prepareLeadForOccasionWrite(leadId, occasionId);
    }

    if (mode === "single" && sequencePosition && [2, 3].includes(sequencePosition)) {
      await assertCredits(ctx.tenantId, "writer.draft", 1);
      const outreachId = await regenerateSequenceStep(leadId, sequencePosition as 2 | 3, {
        outreachTemplate: outreachTemplate as OutreachTemplateId | undefined,
        writerMode: resolvedWriterMode,
        occasionTheme,
      });
      await deductCredits({ tenantId: ctx.tenantId, action: "writer.draft", referenceId: outreachId });
      void checkLowBalanceAlerts(ctx.tenantId);
      const draft = await db.query.leadOutreach.findFirst({ where: eq(leadOutreach.id, outreachId) });
      if (!draft) return NextResponse.json({ error: "Draft not found after write" }, { status: 500 });
      return NextResponse.json({ draft: toWriterDraft(draft, { sequencePosition: draft.sequencePosition ?? undefined }) });
    }

    const requestedTemplate = outreachTemplate as OutreachTemplateId | undefined;
    const useSequence = mode !== "single";

    if (useSequence) {
      await assertCredits(ctx.tenantId, "writer.draft", 3);
      const ids = await runWriterSequence(leadId, {
        outreachTemplate: requestedTemplate,
        writerMode: resolvedWriterMode,
        occasionTheme,
      });
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
    const outreachId = await runWriter(leadId, {
      outreachTemplate: requestedTemplate,
      writerMode: resolvedWriterMode,
      occasionTheme,
    });
    await deductCredits({ tenantId: ctx.tenantId, action: "writer.draft", referenceId: outreachId });
    void checkLowBalanceAlerts(ctx.tenantId);

    const draft = await db.query.leadOutreach.findFirst({ where: eq(leadOutreach.id, outreachId) });
    if (!draft) return NextResponse.json({ error: "Draft not found after write" }, { status: 500 });

    return NextResponse.json({ draft: toWriterDraft(draft) });
  } catch (e) {
    if (e instanceof ResearchNotReadyError) {
      return NextResponse.json(
        { code: e.code, error: e.message, missing: e.missing },
        { status: 422 },
      );
    }
    const errRes = handleApiError(e, "[api/agents/writer/run]");
    if (errRes.status !== 500) return errRes;
    return NextResponse.json({ error: friendlyLLMError(e) }, { status: llmErrorHttpStatus(e) });
  }
}

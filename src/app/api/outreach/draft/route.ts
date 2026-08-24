import { NextResponse } from "next/server";
import { db, leadOutreach, leads, yieldFunnel } from "@/db";
import { and, eq, inArray } from "drizzle-orm";
import { requireTenantContext } from "@/lib/tenant";
import { handleApiError } from "@/lib/api-errors";
import { requirePipelineWrite } from "@/lib/auth/permissions";
import { normalizeEmailBody } from "@/lib/email/email-body-format";
import { companyNameForEmail } from "@/lib/email/company-display-name";
import { deleteLeadOutreachWhere } from "@/lib/outreach/delete-lead-outreach";
import { toWriterDraft } from "@/lib/agents/writer-draft";
import { isContactReadyStage, isManualStage } from "@/lib/pipeline-status";
import { OUTREACH_TEMPLATES, type OutreachTemplateId } from "@/lib/email/outreach-templates";

/** Create a blank 3-email sequence the user can write themselves. */
export async function POST(req: Request) {
  try {
    const ctx = await requireTenantContext();
    requirePipelineWrite(ctx);
    const body = await req.json().catch(() => ({}));
    const { leadId, outreachTemplate } = body as {
      leadId?: string;
      outreachTemplate?: string;
    };

    if (!leadId) {
      return NextResponse.json({ error: "leadId required" }, { status: 400 });
    }

    const lead = await db.query.leads.findFirst({
      where: eq(leads.id, leadId),
      with: { contact: true, account: true },
    });
    if (!lead || lead.tenantId !== ctx.tenantId) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }
    if (isManualStage(lead.status)) {
      return NextResponse.json({ error: `Cannot draft in ${lead.status} stage` }, { status: 400 });
    }
    if (!isContactReadyStage(lead.status) && lead.status !== "draft_ready") {
      return NextResponse.json({ error: "Lead is not ready for drafting" }, { status: 400 });
    }

    const templateId =
      OUTREACH_TEMPLATES.some((t) => t.id === outreachTemplate)
        ? (outreachTemplate as OutreachTemplateId)
        : "gift_sampling";
    const company = companyNameForEmail(lead.account?.name ?? "your team");

    await deleteLeadOutreachWhere(
      and(eq(leadOutreach.leadId, leadId), inArray(leadOutreach.sequencePosition, [1, 2, 3])),
    );

    const rows = await db
      .insert(leadOutreach)
      .values([
        {
          leadId,
          draftSource: "manual",
          promptVersion: "manual-blank",
          subjectA: `Email for ${company}`,
          subjectB: null,
          subjectC: null,
          emailBody: "",
          emailBodyB: null,
          emailBodyC: null,
          chosenSubjectKey: "A",
          chosenBodyKey: "A",
          templateVariant: templateId,
          outreachGoal: "Gift sampling",
          confidenceTier: "manual",
          sequencePosition: 1,
          deliverabilityScore: null,
          deliverabilityVerdict: null,
          revisionCount: 0,
          revisionTimeout: false,
        },
        {
          leadId,
          draftSource: "manual",
          promptVersion: "manual-blank",
          subjectA: `Re: Email for ${company}`,
          subjectB: null,
          subjectC: null,
          emailBody: "",
          emailBodyB: null,
          emailBodyC: null,
          chosenSubjectKey: "A",
          chosenBodyKey: "A",
          templateVariant: templateId,
          outreachGoal: "Follow-up reminder",
          confidenceTier: "manual",
          sequencePosition: 2,
          deliverabilityScore: null,
          deliverabilityVerdict: null,
          revisionCount: 0,
          revisionTimeout: false,
        },
        {
          leadId,
          draftSource: "manual",
          promptVersion: "manual-blank",
          subjectA: `Re: Email for ${company}`,
          subjectB: null,
          subjectC: null,
          emailBody: "",
          emailBodyB: null,
          emailBodyC: null,
          chosenSubjectKey: "A",
          chosenBodyKey: "A",
          templateVariant: templateId,
          outreachGoal: "Final reminder",
          confidenceTier: "manual",
          sequencePosition: 3,
          deliverabilityScore: null,
          deliverabilityVerdict: null,
          revisionCount: 0,
          revisionTimeout: false,
        },
      ])
      .returning();

    await db.update(leads).set({ status: "draft_ready" }).where(eq(leads.id, leadId));
    await db.insert(yieldFunnel).values({ leadId, stage: "draft_ready", metadata: { source: "manual" } });

    const drafts = rows
      .sort((a, b) => (a.sequencePosition ?? 0) - (b.sequencePosition ?? 0))
      .map((r) => toWriterDraft(r, { sequencePosition: r.sequencePosition ?? undefined }));

    return NextResponse.json({ drafts, draft: drafts[0] });
  } catch (e) {
    return handleApiError(e, "[api/outreach/draft POST]");
  }
}

export async function PATCH(req: Request) {
  try {
    const ctx = await requireTenantContext();
    requirePipelineWrite(ctx);
    const body = await req.json();
    const {
      leadOutreachId,
      emailBody,
      emailBodyB,
      emailBodyC,
      subjectA,
      subjectB,
      subjectC,
      chosenSubjectKey,
      chosenBodyKey,
      whatsapp,
    } = body as {
      leadOutreachId: string;
      emailBody?: string;
      emailBodyB?: string;
      emailBodyC?: string;
      subjectA?: string;
      subjectB?: string;
      subjectC?: string;
      chosenSubjectKey?: string;
      chosenBodyKey?: string;
      whatsapp?: string;
    };

    if (!leadOutreachId) {
      return NextResponse.json({ error: "leadOutreachId required" }, { status: 400 });
    }

    const updates: Partial<typeof leadOutreach.$inferInsert> = {};
    if (emailBody !== undefined) updates.emailBody = normalizeEmailBody(emailBody);
    if (emailBodyB !== undefined) updates.emailBodyB = emailBodyB ? normalizeEmailBody(emailBodyB) : emailBodyB;
    if (emailBodyC !== undefined) updates.emailBodyC = emailBodyC ? normalizeEmailBody(emailBodyC) : emailBodyC;
    if (subjectA !== undefined) updates.subjectA = subjectA;
    if (subjectB !== undefined) updates.subjectB = subjectB;
    if (subjectC !== undefined) updates.subjectC = subjectC;
    if (chosenSubjectKey !== undefined) updates.chosenSubjectKey = chosenSubjectKey;
    if (chosenBodyKey !== undefined) updates.chosenBodyKey = chosenBodyKey;
    if (whatsapp !== undefined) updates.whatsapp = whatsapp;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const [existing] = await db
      .select({ outreach: leadOutreach, lead: leads })
      .from(leadOutreach)
      .innerJoin(leads, eq(leads.id, leadOutreach.leadId))
      .where(eq(leadOutreach.id, leadOutreachId))
      .limit(1);

    if (!existing || existing.lead.tenantId !== ctx.tenantId) {
      return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    }

    const [row] = await db
      .update(leadOutreach)
      .set(updates)
      .where(eq(leadOutreach.id, leadOutreachId))
      .returning();

    if (!row) return NextResponse.json({ error: "Draft not found" }, { status: 404 });

    return NextResponse.json({
      id: row.id,
      subjectA: row.subjectA,
      subjectB: row.subjectB,
      subjectC: row.subjectC,
      emailBody: row.emailBody,
      emailBodyB: row.emailBodyB,
      emailBodyC: row.emailBodyC,
      chosenSubjectKey: row.chosenSubjectKey,
      chosenBodyKey: row.chosenBodyKey,
      whatsapp: row.whatsapp,
    });
  } catch (e) {
    return handleApiError(e, "[api/outreach/draft]");
  }
}

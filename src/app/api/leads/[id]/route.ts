import { NextResponse } from "next/server";
import { requireTenantContext, ForbiddenError } from "@/lib/tenant";
import { db, leads, contacts, accounts, leadResearch, leadOutreach, outreachApprovals, outreachSchedule, yieldFunnel, outreachEditMessages } from "@/db";
import { eq, desc, asc, and, inArray, isNotNull } from "drizzle-orm";
import { canManuallyAdvance, isEmailOutreachStarted, parseDealAmount } from "@/lib/pipeline-status";
import { logAudit } from "@/lib/audit";
import { handleApiError } from "@/lib/api-errors";
import type { LeadDetailRecord } from "@/lib/api-client";
import { toWriterDraft } from "@/lib/agents/writer-draft";
import { buildContactEmails, hasUsableEmail } from "@/lib/enrichment/contact-emails";
import { buildEmailThread } from "@/lib/email/email-thread";
import { getResolvedEmailConfig } from "@/lib/settings/email-settings";
import { requirePipelineWrite } from "@/lib/auth/permissions";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ctx = await requireTenantContext();

    const rows = await db
      .select({ lead: leads, contact: contacts, account: accounts })
      .from(leads)
      .innerJoin(contacts, eq(contacts.id, leads.contactId))
      .innerJoin(accounts, eq(accounts.id, leads.accountId))
      .where(eq(leads.id, id))
      .limit(1);

    if (!rows.length) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const { lead, contact, account } = rows[0];

    if (lead.tenantId !== ctx.tenantId) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const [research, outreach, scheduleRows, sequenceDraftRows, emailConfig] = await Promise.all([
      db.query.leadResearch.findFirst({ where: eq(leadResearch.leadId, id) }),
      db.query.leadOutreach.findFirst({
        where: eq(leadOutreach.leadId, id),
        orderBy: [desc(leadOutreach.createdAt)],
      }),
      db
        .select()
        .from(outreachSchedule)
        .where(eq(outreachSchedule.leadId, id))
        .orderBy(outreachSchedule.scheduledFor),
      db.query.leadOutreach.findMany({
        where: and(eq(leadOutreach.leadId, id), isNotNull(leadOutreach.sequencePosition)),
        orderBy: [asc(leadOutreach.sequencePosition)],
      }),
      getResolvedEmailConfig(lead.workspaceId),
    ]);

    const replyDraftRow = outreach?.templateVariant === "reply" ? outreach : null;
    const activeOutreach = replyDraftRow ?? (sequenceDraftRows[0] ?? outreach ?? null);

    const [approval, editMessages, replySentRow] = activeOutreach
      ? await Promise.all([
          db.query.outreachApprovals.findFirst({
            where: eq(outreachApprovals.leadOutreachId, activeOutreach.id),
            orderBy: [desc(outreachApprovals.createdAt)],
          }),
          db.query.outreachEditMessages.findMany({
            where: eq(outreachEditMessages.leadOutreachId, activeOutreach.id),
            orderBy: [asc(outreachEditMessages.createdAt)],
          }),
          activeOutreach.templateVariant === "reply"
            ? db.query.outreachApprovals
                .findFirst({
                  where: eq(outreachApprovals.leadOutreachId, activeOutreach.id),
                  orderBy: [desc(outreachApprovals.createdAt)],
                })
                .then(async (latestApproval) => {
                  if (!latestApproval) return null;
                  return db.query.outreachSchedule.findFirst({
                    where: and(
                      eq(outreachSchedule.approvalId, latestApproval.id),
                      eq(outreachSchedule.status, "sent"),
                    ),
                  });
                })
            : Promise.resolve(null),
        ])
      : [null, [], null];


    const approvalIds = scheduleRows.map((r) => r.approvalId).filter((id): id is string => Boolean(id));
    const approvalOutreachRows =
      approvalIds.length > 0
        ? await db
            .select({
              approvalId: outreachApprovals.id,
              emailBody: leadOutreach.emailBody,
            })
            .from(outreachApprovals)
            .innerJoin(leadOutreach, eq(leadOutreach.id, outreachApprovals.leadOutreachId))
            .where(inArray(outreachApprovals.id, approvalIds))
        : [];
    const outreachBodiesByApprovalId = Object.fromEntries(
      approvalOutreachRows
        .filter((r) => r.emailBody)
        .map((r) => [r.approvalId, r.emailBody as string]),
    );

    const repliedFunnel = await db.query.yieldFunnel.findFirst({
      where: and(eq(yieldFunnel.leadId, id), eq(yieldFunnel.stage, "replied")),
      orderBy: [desc(yieldFunnel.enteredAt)],
    });

    const replyDraftSent = Boolean(replySentRow);
    const outreachSequence = sequenceDraftRows.map((d) => toWriterDraft(d, { sequencePosition: d.sequencePosition ?? undefined }));
    const emailThread = buildEmailThread({
      lead,
      scheduleRows,
      sequenceDrafts: sequenceDraftRows,
      latestOutreach: activeOutreach ?? null,
      replyDraftSent,
      outreachBodiesByApprovalId,
      inboundReplyAt: repliedFunnel?.enteredAt?.toISOString() ?? null,
      cadenceDays: emailConfig.cadenceDays,
    });
    const upNext = deriveUpNext(
      lead.status,
      scheduleRows,
      contact.email,
      contact.emailStatus,
      Boolean(outreach),
      outreach,
      replyDraftSent,
    );

    const record: LeadDetailRecord = {
      id: lead.id,
      name: contact.name,
      firstName: contact.firstName ?? contact.name.split(" ")[0],
      lastName: contact.lastName ?? contact.name.split(" ").slice(1).join(" "),
      title: contact.title ?? "—",
      company: account.name,
      city: account.city ?? "—",
      employees: account.employees ?? "—",
      email: contact.email ?? "—",
      emails: buildContactEmails({
        primaryEmail: contact.email,
        emailStatus: contact.emailStatus,
        emailConfidence: contact.emailConfidence,
        enrichmentSource: contact.enrichmentSource,
        enrichmentProvider: contact.enrichmentProvider,
        alternateEmails: (contact.alternateEmails as import("@/lib/enrichment/contact-emails").ContactEmailEntry[] | null) ?? [],
      }),
      emailStatus: contact.emailStatus ?? "missing",
      emailConfidence: contact.emailConfidence ?? undefined,
      enrichmentSource: contact.enrichmentSource ?? undefined,
      enrichmentProvider: contact.enrichmentProvider ?? undefined,
      phone: contact.phone ?? undefined,
      linkedIn: contact.linkedIn ?? undefined,
      score: lead.score ?? 60,
      scoreGrade: lead.scoreGrade ?? gradeFromScore(lead.score ?? 60),
      scoreTrend: lead.scoreTrend ?? "Steady",
      estimatedValue: lead.estimatedValue ?? research?.estimatedOrderValue ?? undefined,
      closedDealAmount: lead.closedDealAmount ?? undefined,
      status: lead.status,
      leadSource: lead.leadSource ?? "scout",
      rating: lead.rating ?? "Warm",
      owner: lead.owner ?? "ISH Cluster Mgr",
      tags: (lead.tags as string[]) ?? [],
      research: research
        ? {
            confidenceTier: research.confidenceTier,
            giftingHook: research.giftingHook ?? undefined,
            estimatedOrderValue: research.estimatedOrderValue ?? undefined,
            scoreFactors: (research.scoreFactors as { label: string; bold: string }[]) ?? [],
          }
        : undefined,
      outreach: activeOutreach
        ? toWriterDraft(activeOutreach, {
            approvalStatus: approval?.status ?? "pending",
            replySent: Boolean(replySentRow),
            editMessages,
            sequencePosition: activeOutreach.sequencePosition ?? undefined,
          })
        : undefined,
      outreachSequence: outreachSequence.length ? outreachSequence : undefined,
      upNext,
      network: [],
      giftingIntelligence: account.intelNotes ?? research?.giftingHook ?? undefined,
      companyOverview: (account.companyOverview as import("@/lib/company-overview").CompanyOverview | null) ?? undefined,
      accountId: account.id,
      industry: account.industry ?? undefined,
      giftScore: account.giftScore ?? undefined,
      giftBudget: account.giftBudget ?? undefined,
      isPinned: lead.isPinned ?? false,
      emailThread,
    };

    return NextResponse.json({ lead: record });
  } catch (e) {
    return handleApiError(e, "[api/leads/[id]]");
  }
}

function gradeFromScore(score: number): string {
  if (score > 85) return "Grade A";
  if (score > 65) return "Grade B";
  return "Grade C";
}

function deriveUpNext(
  status: string,
  schedule: (typeof outreachSchedule.$inferSelect)[],
  email?: string | null,
  emailStatus?: string | null,
  hasDraft = false,
  outreach?: typeof leadOutreach.$inferSelect | null,
  replyDraftSent = false,
): LeadDetailRecord["upNext"] {
  const tasks: LeadDetailRecord["upNext"] = [];

  const canSuggestWrite = hasUsableEmail(email, emailStatus) && !isEmailOutreachStarted(status, hasDraft);
  if ((status === "researched" || status === "scouted" || status === "prefiltered") && canSuggestWrite) {
    tasks.push({
      title: "Write Email",
      step: "Suggested next step",
      desc: "This contact has an email — start personalized outreach",
      icon: "mail",
      active: true,
      primaryAction: "Write Email",
    });
  }

  if (status === "draft_ready") {
    tasks.push({
      title: "Review & Approve Email",
      step: "Step 1 · Awaiting your approval",
      desc: "Review the draft and send to start your sequence",
      icon: "mail",
      active: true,
      primaryAction: "Approve",
    });
  }

  if (status === "outreached") {
    tasks.push({
      title: "Awaiting prospect reply",
      step: "In thread",
      desc: "Follow-ups are scheduled until they reply",
      icon: "mail",
      active: false,
    });
  }

  const isReplyDraft = outreach?.templateVariant === "reply";
  if (status === "replied" && isReplyDraft && !replyDraftSent) {
    tasks.push({
      title: "Send reply in thread",
      step: "Reply draft ready",
      desc: "Review and send your reply in the existing email thread",
      icon: "mail",
      active: true,
      primaryAction: "Send Reply",
    });
  } else if (status === "replied" && !isReplyDraft) {
    tasks.push({
      title: "Regenerate reply draft",
      step: "They replied",
      desc: "Generate an AI draft that continues the conversation",
      icon: "mail",
      active: true,
      primaryAction: "Regenerate reply",
    });
  }

  const pending = schedule.filter((s) => s.status === "scheduled" && s.sequenceDay > 0);
  for (const s of pending.slice(0, 3)) {
    const due = new Date(s.scheduledFor).toLocaleDateString("en-IN", { month: "short", day: "numeric" });
    tasks.push({
      title: `Day ${s.sequenceDay} Follow-up`,
      step: `Due ${due}`,
      desc: "Scheduled follow-up email",
      icon: "mail",
      active: false,
    });
  }

  return tasks;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ctx = await requireTenantContext();
    requirePipelineWrite(ctx);
    const body = await req.json();
    const { status: nextStatus, closedDealAmount } = body as {
      status?: string;
      closedDealAmount?: string;
    };

    if (!nextStatus) {
      return NextResponse.json({ error: "status required" }, { status: 400 });
    }

    const lead = await db.query.leads.findFirst({ where: eq(leads.id, id) });
    if (!lead || lead.tenantId !== ctx.tenantId) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    if (!canManuallyAdvance(lead.status, nextStatus)) {
      return NextResponse.json(
        { error: `Cannot advance from ${lead.status} to ${nextStatus}` },
        { status: 400 },
      );
    }

    if (nextStatus === "closed") {
      if (!closedDealAmount?.trim()) {
        return NextResponse.json({ error: "closedDealAmount required to close deal" }, { status: 400 });
      }
      const parsed = parseDealAmount(closedDealAmount);
      if (parsed === null) {
        return NextResponse.json({ error: "Invalid deal amount" }, { status: 400 });
      }
    }

    const updates: { status: string; closedDealAmount?: string; updatedAt: Date } = {
      status: nextStatus,
      updatedAt: new Date(),
    };
    if (nextStatus === "closed" && closedDealAmount) {
      updates.closedDealAmount = closedDealAmount.trim();
    }

    await db.update(leads).set(updates).where(eq(leads.id, id));

    if (nextStatus === "closed") {
      await db.insert(yieldFunnel).values({
        leadId: id,
        stage: "po_closed",
        metadata: { closedDealAmount: closedDealAmount?.trim(), source: "manual" },
      });
    }

    await logAudit({
      tenantId: ctx.tenantId,
      workspaceId: ctx.workspaceId,
      actorId: ctx.userId,
      action: `lead.status.${nextStatus}`,
      entityType: "lead",
      entityId: id,
      metadata: { from: lead.status, to: nextStatus, closedDealAmount },
    });

    return NextResponse.json({ ok: true, status: nextStatus });
  } catch (e) {
    return handleApiError(e, "[api/leads/[id] PATCH]");
  }
}


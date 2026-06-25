import { NextResponse } from "next/server";
import { requireTenantContext, ForbiddenError } from "@/lib/tenant";
import { db, leads, contacts, accounts, leadResearch, leadOutreach, outreachApprovals, outreachSchedule, yieldFunnel, outreachEditMessages } from "@/db";
import { eq, desc, asc } from "drizzle-orm";
import { canManuallyAdvance, parseDealAmount } from "@/lib/pipeline-status";
import { logAudit } from "@/lib/audit";
import { handleApiError } from "@/lib/api-errors";
import type { LeadDetailRecord } from "@/lib/api-client";
import { toEditMessage } from "@/lib/agents/writer-draft";

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

    const [research, outreach, scheduleRows] = await Promise.all([
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
    ]);

    const [approval, editMessages] = outreach
      ? await Promise.all([
          db.query.outreachApprovals.findFirst({
            where: eq(outreachApprovals.leadOutreachId, outreach.id),
          }),
          db.query.outreachEditMessages.findMany({
            where: eq(outreachEditMessages.leadOutreachId, outreach.id),
            orderBy: [asc(outreachEditMessages.createdAt)],
          }),
        ])
      : [null, []];

    const upNext = deriveUpNext(lead.status, scheduleRows);

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
      outreach: outreach
        ? {
            id: outreach.id,
            subjectA: outreach.subjectA ?? undefined,
            subjectB: outreach.subjectB ?? undefined,
            emailBody: outreach.emailBody ?? undefined,
            deliverabilityScore: outreach.deliverabilityScore ?? undefined,
            deliverabilityVerdict: outreach.deliverabilityVerdict ?? undefined,
            rubricScore: (outreach.rubricScore as Record<string, number>) ?? undefined,
            rubricTotal: outreach.rubricTotal ?? undefined,
            draftSource: outreach.draftSource,
            promptVersion: outreach.promptVersion ?? undefined,
            revisionCount: outreach.revisionCount ?? 0,
            revisionTimeout: outreach.revisionTimeout ?? false,
            templateVariant: outreach.templateVariant ?? undefined,
            outreachGoal: outreach.outreachGoal ?? undefined,
            confidenceTier: outreach.confidenceTier ?? undefined,
            approvalStatus: approval?.status ?? "pending",
            editMessages: editMessages.map(toEditMessage),
          }
        : undefined,
      upNext,
      network: [],
      giftingIntelligence: account.intelNotes ?? research?.giftingHook ?? undefined,
      companyOverview: (account.companyOverview as import("@/lib/company-overview").CompanyOverview | null) ?? undefined,
      accountId: account.id,
      industry: account.industry ?? undefined,
      giftScore: account.giftScore ?? undefined,
      giftBudget: account.giftBudget ?? undefined,
      isPinned: lead.isPinned ?? false,
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
): LeadDetailRecord["upNext"] {
  const tasks: LeadDetailRecord["upNext"] = [];

  if (status === "researched" || status === "scouted" || status === "prefiltered") {
    tasks.push({
      title: "Generate Email Draft",
      step: "Step 1 · Ready now",
      desc: "Write a personalized outreach email for this contact",
      icon: "mail",
      active: true,
      primaryAction: "Generate",
    });
  }

  if (status === "draft_ready") {
    tasks.push({
      title: "Review & Approve Email",
      step: "Step 1 · Awaiting your approval",
      desc: "Check the draft and approve or reject",
      icon: "mail",
      active: true,
      primaryAction: "Approve",
    });
  }

  const pending = schedule.filter((s) => s.status === "scheduled");
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


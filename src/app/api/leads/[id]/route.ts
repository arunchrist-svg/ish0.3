import { NextResponse } from "next/server";
import { db, leads, contacts, accounts, leadResearch, leadOutreach, outreachApprovals, outreachSchedule } from "@/db";
import { eq, desc } from "drizzle-orm";
import type { LeadDetailRecord } from "@/lib/api-client";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

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

    const research = await db.query.leadResearch.findFirst({
      where: eq(leadResearch.leadId, id),
    });

    const outreach = await db.query.leadOutreach.findFirst({
      where: eq(leadOutreach.leadId, id),
      orderBy: [desc(leadOutreach.createdAt)],
    });

    const approval = outreach
      ? await db.query.outreachApprovals.findFirst({
          where: eq(outreachApprovals.leadOutreachId, outreach.id),
        })
      : null;

    const scheduleRows = await db
      .select()
      .from(outreachSchedule)
      .where(eq(outreachSchedule.leadId, id))
      .orderBy(outreachSchedule.scheduledFor);

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
      phone: contact.phone ?? undefined,
      linkedIn: contact.linkedIn ?? undefined,
      score: lead.score ?? 60,
      scoreGrade: lead.scoreGrade ?? gradeFromScore(lead.score ?? 60),
      scoreTrend: lead.scoreTrend ?? "Steady",
      estimatedValue: lead.estimatedValue ?? research?.estimatedOrderValue ?? undefined,
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
          }
        : undefined,
      upNext,
      network: [],
      giftingIntelligence: account.intelNotes ?? research?.giftingHook ?? undefined,
    };

    return NextResponse.json({ lead: record });
  } catch (e) {
    console.error("[api/leads/[id]]", e);
    return NextResponse.json({ error: "Failed to load lead" }, { status: 500 });
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

  if (status === "researched" || status === "scouted") {
    tasks.push({
      title: "Generate Email Draft",
      step: "Step 1 · Ready now",
      desc: "Click Generate in the toolbar to create a personalized email",
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



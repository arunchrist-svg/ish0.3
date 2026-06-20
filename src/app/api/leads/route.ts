import { NextResponse } from "next/server";
import { db, leads, contacts, accounts, leadResearch, outreachApprovals, leadOutreach, outreachSchedule } from "@/db";
import { eq, desc, inArray } from "drizzle-orm";
import { runResearcherLite } from "@/lib/agents/researcher-lite";
import type { LeadQueueItem } from "@/lib/api-client";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const statusFilter = searchParams.get("status");

    const rows = await db
      .select({
        lead: leads,
        contact: contacts,
        account: accounts,
      })
      .from(leads)
      .innerJoin(contacts, eq(contacts.id, leads.contactId))
      .innerJoin(accounts, eq(accounts.id, leads.accountId))
      .orderBy(desc(leads.createdAt))
      .limit(100);

    const filtered = statusFilter
      ? rows.filter((r) => statusFilter.split(",").includes(r.lead.status))
      : rows;

    const queue: LeadQueueItem[] = filtered.map((r) => ({
      id: r.lead.id,
      name: r.contact.name,
      title: r.contact.title ?? "—",
      company: r.account.name,
      city: r.account.city ?? "—",
      score: r.lead.score ?? 60,
      status: r.lead.status,
      action: deriveAction(r.lead.status),
      emailStatus: r.contact.emailStatus ?? "missing",
      nextActionDate: undefined,
    }));

    // Async kick off researcher for scouted leads (non-blocking)
    const scoutedLeads = filtered.filter((r) => r.lead.status === "scouted" && r.lead.researcherEligible);
    for (const row of scoutedLeads.slice(0, 3)) {
      runResearcherLite(row.lead.id).catch((e) =>
        console.error("[researcher-lite] failed for", row.lead.id, e),
      );
    }

    return NextResponse.json({ leads: queue });
  } catch (e) {
    console.error("[api/leads]", e);
    return NextResponse.json({ error: "Failed to load leads" }, { status: 500 });
  }
}

function deriveAction(status: string): string {
  switch (status) {
    case "scouted": return "Awaiting research";
    case "researched": return "Ready for outreach";
    case "draft_ready": return "Approve email";
    case "approved": return "Send email";
    case "outreached": return "Follow-up";
    case "replied": return "Hot — respond now";
    case "meeting": return "Meeting booked";
    default: return "Review";
  }
}

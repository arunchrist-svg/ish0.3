import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { handleApiError } from "@/lib/api-errors";
import { db, leads, contacts, accounts } from "@/db";
import { eq, desc, inArray, and } from "drizzle-orm";
import { runResearcherLite } from "@/lib/agents/researcher-lite";
import type { LeadQueueItem } from "@/lib/api-client";
import { deriveQueueAction } from "@/lib/pipeline-status";

export async function GET(req: Request) {
  try {
    const ctx = await requireTenantContext();
    const { searchParams } = new URL(req.url);
    const statusFilter = searchParams.get("status");
    const statuses = statusFilter ? statusFilter.split(",").filter(Boolean) : null;

    const rows = await db
      .select({
        id: leads.id,
        status: leads.status,
        score: leads.score,
        researcherEligible: leads.researcherEligible,
        name: contacts.name,
        title: contacts.title,
        emailStatus: contacts.emailStatus,
        company: accounts.name,
        city: accounts.city,
      })
      .from(leads)
      .innerJoin(contacts, eq(contacts.id, leads.contactId))
      .innerJoin(accounts, eq(accounts.id, leads.accountId))
      .where(
        statuses?.length
          ? and(eq(leads.tenantId, ctx.tenantId), inArray(leads.status, statuses))
          : eq(leads.tenantId, ctx.tenantId),
      )
      .orderBy(desc(leads.createdAt))
      .limit(100);

    const queue: LeadQueueItem[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      title: r.title ?? "—",
      company: r.company,
      city: r.city ?? "—",
      score: r.score ?? 60,
      status: r.status,
      action: deriveQueueAction(r.status),
      emailStatus: r.emailStatus ?? "missing",
      nextActionDate: undefined,
    }));

    const scoutedLeads = rows.filter((r) => r.status === "scouted" && r.researcherEligible);
    for (const row of scoutedLeads.slice(0, 3)) {
      runResearcherLite(row.id).catch((e) =>
        console.error("[researcher-lite] failed for", row.id, e),
      );
    }

    return NextResponse.json({ leads: queue });
  } catch (e) {
    return handleApiError(e, "[api/leads]");
  }
}

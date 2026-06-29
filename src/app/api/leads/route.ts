import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { handleApiError } from "@/lib/api-errors";
import { db, leads, contacts, accounts } from "@/db";
import { eq, desc, inArray, and } from "drizzle-orm";
import { runResearcherLite } from "@/lib/agents/researcher-lite";
import type { LeadQueueItem } from "@/lib/api-client";
import { deriveQueueAction } from "@/lib/pipeline-status";
import { requirePipelineWrite } from "@/lib/auth/permissions";
import { createManualLead } from "@/lib/leads/crud";

export async function GET(req: Request) {
  try {
    const ctx = await requireTenantContext();
    const { searchParams } = new URL(req.url);
    const statusFilter = searchParams.get("status");
    const statuses = statusFilter ? statusFilter.split(",").filter(Boolean) : null;
    const limitParam = searchParams.get("limit");
    const rowLimit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 100, 1), 100) : 100;

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
      .limit(rowLimit);

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
    if (rowLimit >= 100) for (const row of scoutedLeads.slice(0, 3)) {
      runResearcherLite(row.id).catch((e) =>
        console.error("[researcher-lite] failed for", row.id, e),
      );
    }

    return NextResponse.json({ leads: queue });
  } catch (e) {
    return handleApiError(e, "[api/leads]");
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireTenantContext();
    requirePipelineWrite(ctx);
    const body = (await req.json()) as {
      name?: string;
      title?: string;
      email?: string;
      phone?: string;
      linkedIn?: string;
      company?: string;
      city?: string;
      industry?: string;
      employees?: string;
      score?: number;
      tags?: string[];
    };

    if (!body.name?.trim() || !body.company?.trim()) {
      return NextResponse.json({ error: "Name and company are required" }, { status: 400 });
    }

    const result = await createManualLead({
      tenantId: ctx.tenantId,
      workspaceId: ctx.workspaceId,
      actorId: ctx.userId,
      name: body.name,
      title: body.title,
      email: body.email,
      phone: body.phone,
      linkedIn: body.linkedIn,
      company: body.company,
      city: body.city,
      industry: body.industry,
      employees: body.employees,
      score: body.score,
      tags: body.tags,
    });

    return NextResponse.json({ ok: true, id: result.id }, { status: 201 });
  } catch (e) {
    return handleApiError(e, "[api/leads POST]");
  }
}

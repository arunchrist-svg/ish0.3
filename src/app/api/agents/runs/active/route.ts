import { NextResponse } from "next/server";
import { db, agentRuns, leads, contacts } from "@/db";
import { eq, and, desc, gte, inArray, isNull, or } from "drizzle-orm";
import { requireTenantContext } from "@/lib/tenant";
import { handleApiError } from "@/lib/api-errors";
import { withLeadVisibility } from "@/lib/leads/lead-visibility";

export async function GET() {
  try {
    const ctx = await requireTenantContext();
    const since = new Date(Date.now() - 2 * 60 * 60 * 1000);

    const rows = await db
      .select({
        id: agentRuns.id,
        agent: agentRuns.agent,
        leadId: agentRuns.leadId,
        status: agentRuns.status,
        error: agentRuns.error,
        startedAt: agentRuns.startedAt,
        completedAt: agentRuns.completedAt,
      })
      .from(agentRuns)
      .leftJoin(leads, eq(leads.id, agentRuns.leadId))
      .where(
        and(
          eq(agentRuns.tenantId, ctx.tenantId),
          gte(agentRuns.startedAt, since),
          or(isNull(agentRuns.leadId), withLeadVisibility(ctx, eq(leads.tenantId, ctx.tenantId))),
        ),
      )
      .orderBy(desc(agentRuns.startedAt))
      .limit(20);

    const leadIds = [...new Set(rows.map((r) => r.leadId).filter(Boolean))] as string[];
    const leadNames = new Map<string, string>();
    if (leadIds.length) {
      const leadRows = await db
        .select({ id: leads.id, name: contacts.name })
        .from(leads)
        .innerJoin(contacts, eq(leads.contactId, contacts.id))
        .where(withLeadVisibility(ctx, eq(leads.tenantId, ctx.tenantId), inArray(leads.id, leadIds)));
      for (const l of leadRows) leadNames.set(l.id, l.name);
    }

    return NextResponse.json({
      runs: rows.map((r) => ({
        ...r,
        leadName: r.leadId ? leadNames.get(r.leadId) ?? null : null,
        startedAt: r.startedAt.toISOString(),
        completedAt: r.completedAt?.toISOString() ?? null,
      })),
    });
  } catch (e) {
    return handleApiError(e, "[api/agents/runs/active]");
  }
}

import { NextResponse } from "next/server";
import { db, yieldFunnel, leads, enrichmentRuns, contacts } from "@/db";
import { count, eq, or, and } from "drizzle-orm";
import { requireTenantContext } from "@/lib/tenant";
import { parseDealAmount } from "@/lib/pipeline-status";
import { handleApiError } from "@/lib/api-errors";

export async function GET() {
  try {
    const ctx = await requireTenantContext();

    const [
      stageCounts,
      totalRuns,
      withEmail,
      verified,
      leadStatuses,
      closedRows,
      contactCount,
    ] = await Promise.all([
      db
        .select({ stage: yieldFunnel.stage, count: count() })
        .from(yieldFunnel)
        .innerJoin(leads, eq(leads.id, yieldFunnel.leadId))
        .where(eq(leads.tenantId, ctx.tenantId))
        .groupBy(yieldFunnel.stage),
      db
        .select({ total: count() })
        .from(enrichmentRuns)
        .innerJoin(contacts, eq(contacts.id, enrichmentRuns.contactId))
        .where(eq(contacts.tenantId, ctx.tenantId)),
      db
        .select({ total: count() })
        .from(enrichmentRuns)
        .innerJoin(contacts, eq(contacts.id, enrichmentRuns.contactId))
        .where(and(eq(contacts.tenantId, ctx.tenantId), eq(enrichmentRuns.emailFound, true))),
      db
        .select({ total: count() })
        .from(enrichmentRuns)
        .innerJoin(contacts, eq(contacts.id, enrichmentRuns.contactId))
        .where(and(eq(contacts.tenantId, ctx.tenantId), eq(enrichmentRuns.emailVerified, true))),
      db
        .select({ status: leads.status, count: count() })
        .from(leads)
        .where(eq(leads.tenantId, ctx.tenantId))
        .groupBy(leads.status),
      db
        .select({ closedDealAmount: leads.closedDealAmount })
        .from(leads)
        .where(and(eq(leads.tenantId, ctx.tenantId), or(eq(leads.status, "closed"), eq(leads.status, "po_closed")))),
      db
        .select({ total: count() })
        .from(contacts)
        .where(eq(contacts.tenantId, ctx.tenantId)),
    ]);

    const closedCount = closedRows.length;
    const totalAmount = closedRows.reduce((sum, row) => {
      if (!row.closedDealAmount) return sum;
      return sum + (parseDealAmount(row.closedDealAmount) ?? 0);
    }, 0);

    return NextResponse.json({
      stages: stageCounts,
      emailAccuracy: {
        totalRuns: totalRuns[0]?.total ?? 0,
        withEmail: withEmail[0]?.total ?? 0,
        verified: verified[0]?.total ?? 0,
        emailFoundRate: totalRuns[0]?.total
          ? Math.round(((withEmail[0]?.total ?? 0) / totalRuns[0].total) * 100)
          : 0,
        verifyRate: (withEmail[0]?.total ?? 0) > 0
          ? Math.round(((verified[0]?.total ?? 0) / (withEmail[0]?.total ?? 1)) * 100)
          : 0,
      },
      leadStatuses,
      closedDeals: { count: closedCount, totalAmount },
      contactCount: contactCount[0]?.total ?? 0,
    });
  } catch (e) {
    return handleApiError(e, "[api/funnel]");
  }
}

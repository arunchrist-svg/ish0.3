import { NextResponse } from "next/server";
import { db, leadOutreach, leads } from "@/db";
import { and, eq, gte, inArray } from "drizzle-orm";
import { requireTenantContext } from "@/lib/tenant";
import { handleApiError } from "@/lib/api-errors";
import { withLeadVisibility } from "@/lib/leads/lead-visibility";

const MAX_LEADS = 5000;

export async function POST(req: Request) {
  try {
    const ctx = await requireTenantContext();
    const body = (await req.json()) as {
      leadIds?: string[];
      statuses?: string[];
      startedAt?: string;
      total?: number;
    };
    const leadIds = [...new Set((body.leadIds ?? []).filter(Boolean))].slice(0, MAX_LEADS);
    const statuses = [...new Set((body.statuses ?? []).filter(Boolean))];
    const startedAt = body.startedAt ? new Date(body.startedAt) : null;
    const total = body.total ?? leadIds.length;

    if ((!leadIds.length && !statuses.length) || !startedAt || Number.isNaN(startedAt.getTime())) {
      return NextResponse.json(
        { error: "startedAt and leadIds or statuses required" },
        { status: 400 },
      );
    }

    const scopeFilter = statuses.length
      ? inArray(leads.status, statuses)
      : inArray(leadOutreach.leadId, leadIds);

    const rows = await db
      .selectDistinct({ leadId: leadOutreach.leadId })
      .from(leadOutreach)
      .innerJoin(leads, eq(leads.id, leadOutreach.leadId))
      .where(
        withLeadVisibility(
          ctx,
          and(
            eq(leads.tenantId, ctx.tenantId),
            scopeFilter,
            eq(leadOutreach.sequencePosition, 1),
            gte(leadOutreach.createdAt, startedAt),
          ),
        ),
      );

    return NextResponse.json({
      completed: rows.length,
      total,
    });
  } catch (e) {
    return handleApiError(e, "[api/agents/writer/write-all/progress]");
  }
}

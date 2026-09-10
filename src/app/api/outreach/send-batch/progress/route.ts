import { NextResponse } from "next/server";
import { eq, gte, inArray, sql } from "drizzle-orm";
import { db, leads, outreachSchedule } from "@/db";
import { requireTenantContext } from "@/lib/tenant";
import { handleApiError } from "@/lib/api-errors";
import { withLeadVisibility } from "@/lib/leads/lead-visibility";

export async function POST(req: Request) {
  try {
    const ctx = await requireTenantContext();
    const body = (await req.json()) as {
      startedAt?: string;
      total?: number;
      statuses?: string[];
    };

    const startedAt = body.startedAt ? new Date(body.startedAt) : null;
    const total = body.total ?? 0;
    const statuses = [...new Set((body.statuses ?? []).filter(Boolean))];

    if (!startedAt || Number.isNaN(startedAt.getTime())) {
      return NextResponse.json({ error: "startedAt required" }, { status: 400 });
    }

    const where = withLeadVisibility(
      ctx,
      eq(leads.tenantId, ctx.tenantId),
      eq(outreachSchedule.channel, "email"),
      eq(outreachSchedule.sequenceDay, 0),
      gte(outreachSchedule.createdAt, startedAt),
      statuses.length ? inArray(leads.status, statuses) : undefined,
    );

    const row = await db
      .select({ n: sql<number>`count(distinct ${outreachSchedule.leadId})::int` })
      .from(outreachSchedule)
      .innerJoin(leads, eq(leads.id, outreachSchedule.leadId))
      .where(where);

    const completed = row[0]?.n ?? 0;

    return NextResponse.json({ completed, total });
  } catch (e) {
    return handleApiError(e, "[api/outreach/send-batch/progress]");
  }
}

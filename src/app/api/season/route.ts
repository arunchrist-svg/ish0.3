import { NextResponse } from "next/server";
import { db, leads, campaigns, users, workspaceSettings } from "@/db";
import { count, eq, or, and, gte, lte, sql } from "drizzle-orm";
import { requireTenantContext } from "@/lib/tenant";
import { parseDealAmount } from "@/lib/pipeline-status";
import { handleApiError } from "@/lib/api-errors";
import { withLeadVisibility } from "@/lib/leads/lead-visibility";

export type SeasonWarRoomData = {
  season: string | null;
  booked: number;
  target: number;
  capacity: number;
  bookedBoxes: number;
  weeklyPipeline: { weekStart: string; outreached: number; replied: number; meeting: number; closed: number }[];
  leaderboard: { userId: string; name: string; closedCount: number; totalAmount: number }[];
};

export async function GET() {
  try {
    const ctx = await requireTenantContext();

    const [activeCampaign, wsRow] = await Promise.all([
      db.query.campaigns.findFirst({
        where: and(eq(campaigns.workspaceId, ctx.workspaceId), eq(campaigns.isActive, true)),
        orderBy: (c, { desc }) => [desc(c.createdAt)],
      }),
      db.query.workspaceSettings.findFirst({
        where: eq(workspaceSettings.workspaceId, ctx.workspaceId),
      }),
    ]);

    const cfg = (wsRow?.enrichmentConfig ?? {}) as {
      festiveTarget?: number;
      festiveCapacity?: number;
    };
    const target = cfg.festiveTarget ?? 0;
    const capacity = cfg.festiveCapacity ?? 0;

    const windowStart = activeCampaign?.startDate ?? new Date(new Date().getFullYear(), 7, 1);
    const windowEnd = activeCampaign?.endDate ?? new Date(new Date().getFullYear(), 11, 31);

    const [closedLeads, leaderboardRows, weeklyRows] = await Promise.all([
      db
        .select({ closedDealAmount: leads.closedDealAmount })
        .from(leads)
        .where(
          withLeadVisibility(
            ctx,
            and(
              eq(leads.tenantId, ctx.tenantId),
              or(eq(leads.status, "closed"), eq(leads.status, "po_closed")),
            ),
          ),
        )
        .limit(1000),

      db
        .select({
          userId: leads.createdByUserId,
          closedCount: count(),
          totalAmount: sql<string>`coalesce(sum(case when ${leads.closedDealAmount} ~ '^[0-9,.]+$' then cast(regexp_replace(${leads.closedDealAmount}, '[^0-9.]', '', 'g') as numeric) else 0 end), 0)`.as("total_amount"),
        })
        .from(leads)
        .where(
          withLeadVisibility(
            ctx,
            and(
              eq(leads.tenantId, ctx.tenantId),
              or(eq(leads.status, "closed"), eq(leads.status, "po_closed")),
            ),
          ),
        )
        .groupBy(leads.createdByUserId)
        .limit(20),

      db
        .select({
          weekStart: sql<string>`date_trunc('week', ${leads.updatedAt})::date::text`.as("week_start"),
          status: leads.status,
          cnt: count(),
        })
        .from(leads)
        .where(
          withLeadVisibility(
            ctx,
            and(
              eq(leads.tenantId, ctx.tenantId),
              gte(leads.updatedAt, windowStart),
              lte(leads.updatedAt, windowEnd),
            ),
          ),
        )
        .groupBy(sql`date_trunc('week', ${leads.updatedAt})`, leads.status)
        .orderBy(sql`date_trunc('week', ${leads.updatedAt})`),
    ]);

    const booked = closedLeads.reduce((sum, row) => {
      if (!row.closedDealAmount) return sum;
      return sum + (parseDealAmount(row.closedDealAmount) ?? 0);
    }, 0);

    // boxes = deal amount used as proxy when no separate quantity field exists
    const bookedBoxes = booked;

    // Aggregate weekly pipeline
    const weekMap = new Map<string, { outreached: number; replied: number; meeting: number; closed: number }>();
    for (const row of weeklyRows) {
      if (!weekMap.has(row.weekStart)) {
        weekMap.set(row.weekStart, { outreached: 0, replied: 0, meeting: 0, closed: 0 });
      }
      const bucket = weekMap.get(row.weekStart)!;
      if (row.status === "outreached") bucket.outreached += Number(row.cnt);
      else if (row.status === "replied") bucket.replied += Number(row.cnt);
      else if (row.status === "meeting") bucket.meeting += Number(row.cnt);
      else if (row.status === "closed" || row.status === "po_closed") bucket.closed += Number(row.cnt);
    }
    const weeklyPipeline = Array.from(weekMap.entries()).map(([weekStart, v]) => ({ weekStart, ...v }));

    // Resolve user names for leaderboard
    const userIds = leaderboardRows.map((r) => r.userId).filter(Boolean) as string[];
    const userRows = userIds.length
      ? await db
          .select({ id: users.id, name: users.name })
          .from(users)
          .where(sql`${users.id} = any(array[${sql.join(userIds.map((id) => sql`${id}::uuid`), sql`, `)}])`)
      : [];
    const userMap = new Map(userRows.map((u) => [u.id, u.name]));

    const leaderboard = leaderboardRows
      .filter((r) => r.userId)
      .map((r) => ({
        userId: r.userId!,
        name: userMap.get(r.userId!) ?? "Unknown",
        closedCount: Number(r.closedCount),
        totalAmount: parseFloat(String(r.totalAmount)) || 0,
      }))
      .sort((a, b) => b.closedCount - a.closedCount);

    return NextResponse.json({
      season: activeCampaign?.season ?? null,
      booked,
      target,
      capacity,
      bookedBoxes,
      weeklyPipeline,
      leaderboard,
    } satisfies SeasonWarRoomData);
  } catch (e) {
    return handleApiError(e, "[api/season]");
  }
}

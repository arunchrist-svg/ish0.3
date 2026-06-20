import { NextResponse } from "next/server";
import { db, yieldFunnel, leads, enrichmentRuns } from "@/db";
import { count, eq } from "drizzle-orm";

export async function GET() {
  try {
    const stageCounts = await db
      .select({ stage: yieldFunnel.stage, count: count() })
      .from(yieldFunnel)
      .groupBy(yieldFunnel.stage);

    const totalRuns = await db.select({ total: count() }).from(enrichmentRuns);
    const withEmail = await db
      .select({ total: count() })
      .from(enrichmentRuns)
      .where(eq(enrichmentRuns.emailFound, true));
    const verified = await db
      .select({ total: count() })
      .from(enrichmentRuns)
      .where(eq(enrichmentRuns.emailVerified, true));

    const leadStatuses = await db
      .select({ status: leads.status, count: count() })
      .from(leads)
      .groupBy(leads.status);

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
    });
  } catch (e) {
    console.error("[api/funnel]", e);
    return NextResponse.json({ error: "Funnel stats failed" }, { status: 500 });
  }
}

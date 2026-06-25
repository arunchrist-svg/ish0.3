import { NextResponse } from "next/server";
import { db, tenants, orgMembers, creditBalances } from "@/db";
import { count, eq } from "drizzle-orm";
import { requireSuperadmin } from "@/lib/tenant";
import { handleApiError } from "@/lib/api-errors";

export async function GET() {
  try {
    await requireSuperadmin();
    const rows = await db
      .select({
        id: tenants.id,
        name: tenants.name,
        plan: tenants.plan,
        demoMode: tenants.demoMode,
        onboardingStatus: tenants.onboardingStatus,
        createdAt: tenants.createdAt,
        credits: creditBalances.balance,
      })
      .from(tenants)
      .leftJoin(creditBalances, eq(creditBalances.tenantId, tenants.id))
      .orderBy(tenants.createdAt);

    const withCounts = await Promise.all(
      rows.map(async (t) => {
        const [memberCount] = await db
          .select({ count: count() })
          .from(orgMembers)
          .where(eq(orgMembers.tenantId, t.id));
        return { ...t, memberCount: memberCount?.count ?? 0 };
      }),
    );

    return NextResponse.json({ tenants: withCounts });
  } catch (e) {
    return handleApiError(e, "[admin/tenants]");
  }
}

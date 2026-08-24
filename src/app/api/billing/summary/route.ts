import { NextResponse } from "next/server";
import { requireTenantContext, ForbiddenError } from "@/lib/tenant";
import { canManageBilling } from "@/lib/auth/permissions";
import { getCreditBalance } from "@/lib/billing/credits";
import { CREDIT_COST_CATALOG } from "@/lib/billing/credit-costs";
import { getTenantPlan } from "@/lib/billing/entitlements";
import { db, creditTransactions, subscriptions } from "@/db";
import { eq, and, gte, lt, sql } from "drizzle-orm";
import { handleApiError } from "@/lib/api-errors";

export async function GET() {
  try {
    const ctx = await requireTenantContext();
    if (!canManageBilling(ctx.role, ctx.platformRole)) {
      throw new ForbiddenError("Owner access required");
    }

    const balance = await getCreditBalance(ctx.tenantId);
    const { plan, tenant } = await getTenantPlan(ctx.tenantId);

    const [sub] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.tenantId, ctx.tenantId))
      .limit(1);

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const usageByAction = await db
      .select({
        action: creditTransactions.action,
        total: sql<number>`abs(sum(${creditTransactions.amount}))`,
      })
      .from(creditTransactions)
      .where(
        and(
          eq(creditTransactions.tenantId, ctx.tenantId),
          lt(creditTransactions.amount, 0),
          gte(creditTransactions.createdAt, since),
        ),
      )
      .groupBy(creditTransactions.action);

    return NextResponse.json({
      plan: plan
        ? {
            slug: plan.slug,
            name: plan.name,
            priceCents: plan.priceCents,
            includedCredits: plan.includedCredits,
            seatLimit: plan.seatLimit,
          }
        : null,
      tenantPlan: tenant?.plan,
      balance,
      canManage: canManageBilling(ctx.role, ctx.platformRole),
      costs: CREDIT_COST_CATALOG,
      subscription: sub ? { status: sub.status, currentPeriodEnd: sub.currentPeriodEnd } : null,
      usageLast30Days: usageByAction,
    });
  } catch (e) {
    return handleApiError(e, "[billing/summary]");
  }
}

import { db, plans, tenants, orgMembers, subscriptions } from "@/db";
import { eq, count } from "drizzle-orm";
import type { DataMode } from "@/lib/enrichment/config";
import { ForbiddenError } from "@/lib/tenant";

export type PlanFeatures = {
  enrichmentMode?: DataMode;
  maxScoutContacts?: number;
  liveSend?: boolean;
  byok?: boolean;
  type?: string;
};

export async function getTenantPlan(tenantId: string) {
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  const slug = tenant?.plan ?? "starter";
  const [plan] = await db.select().from(plans).where(eq(plans.slug, slug)).limit(1);
  return { tenant, plan, features: (plan?.features ?? {}) as PlanFeatures };
}

export async function assertPlanEntitlement(
  tenantId: string,
  check: "paid_enrichment" | "live_send" | "byok" | "invite_seat",
): Promise<void> {
  const { plan, features } = await getTenantPlan(tenantId);

  if (check === "paid_enrichment") {
    const mode = features.enrichmentMode ?? "free";
    if (mode === "free") {
      throw new ForbiddenError("Paid enrichment requires Growth plan or higher");
    }
  }

  if (check === "live_send" && features.liveSend === false) {
    throw new ForbiddenError("Live email sends require Growth plan or higher");
  }

  if (check === "byok" && !features.byok && plan?.slug !== "scale" && plan?.slug !== "enterprise") {
    throw new ForbiddenError("Bring-your-own API keys require Scale plan or higher");
  }

  if (check === "invite_seat" && plan) {
    const [{ total }] = await db
      .select({ total: count() })
      .from(orgMembers)
      .where(eq(orgMembers.tenantId, tenantId));
    if (total >= plan.seatLimit) {
      throw new ForbiddenError(`Seat limit reached (${plan.seatLimit}). Upgrade your plan.`);
    }
  }
}

export function clampScoutLimit(requested: number, maxAllowed: number): number {
  return Math.min(requested, maxAllowed);
}

export async function getMaxScoutContacts(tenantId: string): Promise<number> {
  const { features } = await getTenantPlan(tenantId);
  return features.maxScoutContacts ?? 25;
}

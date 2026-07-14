import { db, plans } from "@/db";
import { eq, asc, inArray } from "drizzle-orm";
import { SUBSCRIPTION_PLAN_SLUGS, SUBSCRIPTION_PLANS } from "@/lib/billing/plan-catalog";

export async function listSubscriptionPlans() {
  const rows = await db
    .select()
    .from(plans)
    .where(inArray(plans.slug, [...SUBSCRIPTION_PLAN_SLUGS]))
    .orderBy(asc(plans.priceCents));

  if (rows.length === SUBSCRIPTION_PLAN_SLUGS.length) {
    return rows;
  }

  return SUBSCRIPTION_PLANS.map((plan) => ({
    id: plan.slug,
    slug: plan.slug,
    name: plan.name,
    priceCents: plan.priceCents,
    includedCredits: plan.includedCredits,
    seatLimit: plan.seatLimit,
    features: {},
    stripePriceId: null,
    createdAt: new Date(),
  }));
}

export async function listPlans() {
  return listSubscriptionPlans();
}

export async function getPlanBySlug(slug: string) {
  const [plan] = await db.select().from(plans).where(eq(plans.slug, slug)).limit(1);
  if (plan) return plan;

  const fallback = SUBSCRIPTION_PLANS.find((p) => p.slug === slug);
  if (!fallback) return null;

  return {
    id: fallback.slug,
    slug: fallback.slug,
    name: fallback.name,
    priceCents: fallback.priceCents,
    includedCredits: fallback.includedCredits,
    seatLimit: fallback.seatLimit,
    features: {},
    stripePriceId: null,
    createdAt: new Date(),
  };
}

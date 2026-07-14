import { NextResponse } from "next/server";
import { listSubscriptionPlans } from "@/lib/billing/plans";
import { SUBSCRIPTION_PLANS } from "@/lib/billing/plan-catalog";

export async function GET() {
  const plans = await listSubscriptionPlans();
  const highlights = new Map(SUBSCRIPTION_PLANS.map((plan) => [plan.slug, plan.highlight ?? false]));

  return NextResponse.json({
    plans: plans.map((plan) => ({
      slug: plan.slug,
      name: plan.name,
      priceCents: plan.priceCents,
      includedCredits: plan.includedCredits,
      seatLimit: plan.seatLimit,
      highlight: highlights.get(plan.slug) ?? false,
    })),
    currency: "inr",
  });
}

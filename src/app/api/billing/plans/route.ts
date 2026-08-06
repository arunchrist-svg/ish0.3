import { NextResponse } from "next/server";
import { listSubscriptionPlans } from "@/lib/billing/plans";
import { SUBSCRIPTION_PLANS, getPlanCapacity, getPlanBySlug } from "@/lib/billing/plan-catalog";

export async function GET() {
  const plans = await listSubscriptionPlans();

  return NextResponse.json({
    plans: plans.map((plan) => {
      const catalog = getPlanBySlug(plan.slug);
      const capacity = getPlanCapacity(plan.includedCredits);

      return {
        slug: plan.slug,
        name: plan.name,
        priceCents: plan.priceCents,
        includedCredits: plan.includedCredits,
        seatLimit: plan.seatLimit,
        highlight: catalog?.highlight ?? false,
        tagline: catalog?.tagline ?? "",
        bestFor: catalog?.bestFor ?? "",
        benefits: catalog?.benefits ?? [],
        features: catalog?.features ?? {},
        capacity,
      };
    }),
    currency: "inr",
  });
}

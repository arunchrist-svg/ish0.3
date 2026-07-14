export const BILLING_CURRENCY = "inr" as const;

export type SubscriptionPlanSlug = "starter" | "growth" | "scale";

export const SUBSCRIPTION_PLAN_SLUGS: SubscriptionPlanSlug[] = ["starter", "growth", "scale"];

export type PlanDefinition = {
  slug: string;
  name: string;
  priceCents: number;
  includedCredits: number;
  seatLimit: number;
  highlight?: boolean;
};

/**
 * India-market pricing: per workspace (shared credit pool), not per seat.
 * Apollo Basic is ~₹4,100/seat/mo; a 5-person team pays ~₹20,000/mo there.
 * Credits are sized so heavy paid-enrichment use stays margin-positive.
 */
export const SUBSCRIPTION_PLANS: PlanDefinition[] = [
  {
    slug: "starter",
    name: "Starter",
    priceCents: 249900,
    includedCredits: 500,
    seatLimit: 2,
  },
  {
    slug: "growth",
    name: "Growth",
    priceCents: 599900,
    includedCredits: 2500,
    seatLimit: 5,
    highlight: true,
  },
  {
    slug: "scale",
    name: "Scale",
    priceCents: 1299900,
    includedCredits: 8000,
    seatLimit: 15,
  },
];

export const TOP_UP_PACKS = [
  { slug: "topup_1000", credits: 1000, priceCents: 249900, name: "1,000 Credit Top-up" },
  { slug: "topup_5000", credits: 5000, priceCents: 999900, name: "5,000 Credit Top-up" },
  { slug: "topup_20000", credits: 20000, priceCents: 3499900, name: "20,000 Credit Top-up" },
] as const;

/** Shown on pricing page for India buyers comparing to per-seat tools. */
export const PRICING_VALUE_PROPS = [
  "Per workspace, not per seat",
  "Shared credit pool for your whole team",
  "Priced below Apollo for Indian sales teams",
] as const;

export function isSubscriptionPlanSlug(slug: string): slug is SubscriptionPlanSlug {
  return (SUBSCRIPTION_PLAN_SLUGS as string[]).includes(slug);
}

export function formatPlanPrice(priceCents: number): string {
  const rupees = Math.round(priceCents / 100);
  return `₹${rupees.toLocaleString("en-IN")}`;
}

export function formatPlanPriceMonthly(priceCents: number): string {
  return `${formatPlanPrice(priceCents)}/mo`;
}

export function effectiveCreditRate(priceCents: number, credits: number): string {
  if (credits <= 0) return "";
  const perCredit = priceCents / 100 / credits;
  return `₹${perCredit.toFixed(1)}/credit`;
}

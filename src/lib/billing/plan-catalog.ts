import { CREDIT_COSTS } from "@/lib/billing/credit-costs";
import type { DataMode } from "@/lib/enrichment/config";

export const BILLING_CURRENCY = "inr" as const;

export type SubscriptionPlanSlug = "starter" | "growth" | "scale";

export const SUBSCRIPTION_PLAN_SLUGS: SubscriptionPlanSlug[] = ["starter", "growth", "scale"];

export type PlanFeatures = {
  enrichmentMode: DataMode;
  maxScoutContacts: number;
  liveSend: boolean;
  byok?: boolean;
};

export type PlanCapacity = {
  contactsScouted: number;
  companiesScouted: number;
  aiDraftAndSendEmails: number;
  aiDraftsOnly: number;
  liveEmailsOnly: number;
};

export type PlanDefinition = {
  slug: SubscriptionPlanSlug;
  name: string;
  priceCents: number;
  includedCredits: number;
  seatLimit: number;
  highlight?: boolean;
  tagline: string;
  bestFor: string;
  benefits: string[];
  features: PlanFeatures;
};

/**
 * India-market pricing: per workspace (shared credit pool), not per seat.
 * Apollo Basic is ~₹4,100/seat/mo; a 5-person team pays ~₹20,000/mo there.
 */
export const SUBSCRIPTION_PLANS: PlanDefinition[] = [
  {
    slug: "starter",
    name: "Starter",
    priceCents: 249900,
    includedCredits: 500,
    seatLimit: 2,
    tagline: "Test outbound and build your first prospect list",
    bestFor: "Solo founders or 2-person teams getting started",
    features: {
      enrichmentMode: "free",
      maxScoutContacts: 25,
      liveSend: false,
    },
    benefits: [
      "2 team seats with one shared credit pool",
      "Scout up to 25 contacts per run with free enrichment",
      "AI email drafts for manual review and copy-paste send",
      "Brand intelligence sweeps and lead scoring",
    ],
  },
  {
    slug: "growth",
    name: "Growth",
    priceCents: 599900,
    includedCredits: 2500,
    seatLimit: 5,
    highlight: true,
    tagline: "Run daily outreach with live email sends",
    bestFor: "Small sales teams closing gifting and corporate deals",
    features: {
      enrichmentMode: "auto",
      maxScoutContacts: 50,
      liveSend: true,
    },
    benefits: [
      "5 team seats with one shared credit pool",
      "Scout up to 50 contacts per run with auto enrichment",
      "Live email sends from the app (SMTP or Resend)",
      "Full scout → research → AI write → send workflow",
    ],
  },
  {
    slug: "scale",
    name: "Scale",
    priceCents: 1299900,
    includedCredits: 8000,
    seatLimit: 15,
    tagline: "High-volume scouting and outreach at team scale",
    bestFor: "Teams running large gifting campaigns across India",
    features: {
      enrichmentMode: "paid",
      maxScoutContacts: 100,
      liveSend: true,
      byok: true,
    },
    benefits: [
      "15 team seats with one shared credit pool",
      "Scout up to 100 contacts per run with paid enrichment",
      "Bring your own LLM and enrichment API keys",
      "Priority capacity for sequences, sweeps, and live sends",
    ],
  },
];

export const TOP_UP_PACKS = [
  { slug: "topup_1000", credits: 1000, priceCents: 249900, name: "1,000 Credit Top-up" },
  { slug: "topup_5000", credits: 5000, priceCents: 999900, name: "5,000 Credit Top-up" },
  { slug: "topup_20000", credits: 20000, priceCents: 3499900, name: "20,000 Credit Top-up" },
] as const;

export const PRICING_VALUE_PROPS = [
  "Per workspace, not per seat",
  "Shared credit pool for your whole team",
  "Priced below Apollo for Indian sales teams",
] as const;

export function isSubscriptionPlanSlug(slug: string): slug is SubscriptionPlanSlug {
  return (SUBSCRIPTION_PLAN_SLUGS as string[]).includes(slug);
}

export function getPlanCapacity(credits: number): PlanCapacity {
  const scoutContact = CREDIT_COSTS["scout.contact"];
  const scoutCompany = CREDIT_COSTS["scout.company"];
  const aiDraftAndSend = CREDIT_COSTS["writer.draft"] + CREDIT_COSTS["email.live"];
  const aiDraftOnly = CREDIT_COSTS["writer.draft"];
  const liveOnly = CREDIT_COSTS["email.live"];

  return {
    contactsScouted: Math.floor(credits / scoutContact),
    companiesScouted: Math.floor(credits / scoutCompany),
    aiDraftAndSendEmails: Math.floor(credits / aiDraftAndSend),
    aiDraftsOnly: Math.floor(credits / aiDraftOnly),
    liveEmailsOnly: Math.floor(credits / liveOnly),
  };
}

export function getPlanBySlug(slug: string): PlanDefinition | undefined {
  return SUBSCRIPTION_PLANS.find((plan) => plan.slug === slug);
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

export function formatCapacity(value: number): string {
  return value.toLocaleString("en-IN");
}

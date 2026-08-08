"use client";

import Link from "next/link";
import { Button } from "@/design-system";
import { PlanBenefitsList } from "@/components/billing/plan-benefits-list";
import {
  SUBSCRIPTION_PLANS,
  PRICING_VALUE_PROPS,
  effectiveCreditRate,
  formatPlanPriceMonthly,
} from "@/lib/billing/plan-catalog";

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-brand-canvas px-6 py-16">
      <div className="mx-auto max-w-6xl text-center">
        <h1 className="mb-3 text-4xl font-bold text-brand-ink">Simple credit-based pricing</h1>
        <p className="mb-4 text-brand-ink-soft">
          Scout accounts, enrich contacts, write outreach, and send emails. One shared credit pool per workspace, not per seat.
          14-day trial with 200 credits. All prices in INR.
        </p>
        <p className="mb-12 text-sm text-brand-ink-faint">
          Apollo charges about ₹4,100 per user per month. A 5-person team there pays roughly ₹20,000/mo before overages.
          Growth here covers 5 seats for ₹5,999/mo.
        </p>
        <ul className="mb-10 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-brand-ink-soft">
          {PRICING_VALUE_PROPS.map((item) => (
            <li key={item} className="flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-brand-black" />
              {item}
            </li>
          ))}
        </ul>
        <div className="grid gap-6 text-left lg:grid-cols-3">
          {SUBSCRIPTION_PLANS.map((p) => (
            <div
              key={p.slug}
              className={`rounded-2xl border bg-white p-8 shadow-sm ${
                p.highlight ? "border-brand-black ring-2 ring-brand-black/10" : "border-brand-border"
              }`}
            >
              {p.highlight ? (
                <span className="mb-3 inline-block rounded-full bg-brand-black px-3 py-1 text-xs font-semibold text-white">
                  Most popular
                </span>
              ) : null}
              <h2 className="text-xl font-semibold">{p.name}</h2>
              <p className="mt-1 text-sm text-brand-ink-soft">{p.tagline}</p>
              <p className="mt-3 text-3xl font-bold">
                {formatPlanPriceMonthly(p.priceCents).replace("/mo", "")}
                <span className="text-base font-normal text-brand-ink-soft">/mo</span>
              </p>
              <p className="mt-2 text-sm text-brand-ink-soft">
                {p.includedCredits.toLocaleString("en-IN")} credits · {p.seatLimit} seats · {effectiveCreditRate(p.priceCents, p.includedCredits)} effective
              </p>
              <PlanBenefitsList plan={p} />
              <Link href="/signup" className="mt-8 block">
                <Button className="w-full">Start free trial</Button>
              </Link>
            </div>
          ))}
        </div>
        <p className="mt-10 text-sm text-brand-ink-faint">
          Already have an account? <Link href="/login" className="underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}

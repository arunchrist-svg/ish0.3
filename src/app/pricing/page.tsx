"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/design-system";
import {
  SUBSCRIPTION_PLANS,
  PRICING_VALUE_PROPS,
  effectiveCreditRate,
  formatPlanPriceMonthly,
  type PlanDefinition,
} from "@/lib/billing/plan-catalog";

type Plan = Pick<PlanDefinition, "slug" | "name" | "priceCents" | "includedCredits" | "seatLimit"> & {
  highlight?: boolean;
};

export default function PricingPage() {
  const [plans, setPlans] = useState<Plan[]>([]);

  useEffect(() => {
    fetch("/api/billing/plans")
      .then((r) => r.json())
      .then((d) => setPlans(d.plans ?? []));
  }, []);

  const display = plans.length ? plans : SUBSCRIPTION_PLANS;

  return (
    <div className="min-h-screen bg-ish-canvas px-6 py-16">
      <div className="mx-auto max-w-5xl text-center">
        <h1 className="mb-3 text-4xl font-bold text-ish-ink">Simple credit-based pricing</h1>
        <p className="mb-4 text-ish-ink-soft">
          Scout, enrich, research, and send outreach. One shared credit pool per workspace, not per seat.
          14-day trial with 200 credits. All prices in INR.
        </p>
        <p className="mb-12 text-sm text-ish-ink-faint">
          Apollo charges about ₹4,100 per user per month. A 5-person team there pays roughly ₹20,000/mo before overages.
          Growth here covers 5 seats for ₹5,999/mo.
        </p>
        <ul className="mb-10 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-ish-ink-soft">
          {PRICING_VALUE_PROPS.map((item) => (
            <li key={item} className="flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-ish-black" />
              {item}
            </li>
          ))}
        </ul>
        <div className="grid gap-6 sm:grid-cols-3">
          {display.map((p) => (
            <div
              key={p.slug}
              className={`rounded-2xl border bg-white p-8 text-left shadow-sm ${
                p.highlight ? "border-ish-black ring-2 ring-ish-black/10" : "border-ish-border"
              }`}
            >
              {p.highlight ? (
                <span className="mb-3 inline-block rounded-full bg-ish-black px-3 py-1 text-xs font-semibold text-white">
                  Most popular
                </span>
              ) : null}
              <h2 className="text-xl font-semibold">{p.name}</h2>
              <p className="mt-2 text-3xl font-bold">
                {formatPlanPriceMonthly(p.priceCents).replace("/mo", "")}
                <span className="text-base font-normal text-ish-ink-soft">/mo</span>
              </p>
              <ul className="mt-6 space-y-2 text-sm text-ish-ink-soft">
                <li>{p.includedCredits.toLocaleString("en-IN")} credits included</li>
                <li>{p.seatLimit} seats · shared pool</li>
                <li>{effectiveCreditRate(p.priceCents, p.includedCredits)} effective</li>
              </ul>
              <Link href="/signup" className="mt-8 block">
                <Button className="w-full">Start free trial</Button>
              </Link>
            </div>
          ))}
        </div>
        <p className="mt-10 text-sm text-ish-ink-faint">
          Already have an account? <Link href="/login" className="underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}

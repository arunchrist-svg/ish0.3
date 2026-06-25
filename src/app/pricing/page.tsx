"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/design-system";

type Plan = {
  slug: string;
  name: string;
  priceCents: number;
  includedCredits: number;
  seatLimit: number;
};

export default function PricingPage() {
  const [plans, setPlans] = useState<Plan[]>([]);

  useEffect(() => {
    fetch("/api/billing/plans")
      .then((r) => r.json())
      .then((d) => setPlans(d.plans ?? []));
  }, []);

  const display = plans.length
    ? plans
    : [
        { slug: "starter", name: "Starter", priceCents: 9900, includedCredits: 500, seatLimit: 2 },
        { slug: "growth", name: "Growth", priceCents: 29900, includedCredits: 2500, seatLimit: 5 },
        { slug: "scale", name: "Scale", priceCents: 79900, includedCredits: 10000, seatLimit: 15 },
      ];

  return (
    <div className="min-h-screen bg-ish-canvas px-6 py-16">
      <div className="mx-auto max-w-5xl text-center">
        <h1 className="mb-3 text-4xl font-bold text-ish-ink">Simple credit-based pricing</h1>
        <p className="mb-12 text-ish-ink-soft">
          Scout, enrich, research, and send outreach — one credit pool per workspace. 14-day trial with 200 credits.
        </p>
        <div className="grid gap-6 sm:grid-cols-3">
          {display.map((p) => (
            <div key={p.slug} className="rounded-2xl border border-ish-border bg-white p-8 text-left shadow-sm">
              <h2 className="text-xl font-semibold">{p.name}</h2>
              <p className="mt-2 text-3xl font-bold">
                ${(p.priceCents / 100).toFixed(0)}
                <span className="text-base font-normal text-ish-ink-soft">/mo</span>
              </p>
              <ul className="mt-6 space-y-2 text-sm text-ish-ink-soft">
                <li>{p.includedCredits.toLocaleString()} credits included</li>
                <li>{p.seatLimit} seats</li>
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

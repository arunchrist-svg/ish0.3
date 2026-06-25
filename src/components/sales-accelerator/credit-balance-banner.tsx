"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Zap } from "lucide-react";

export function CreditBalanceBanner() {
  const [credits, setCredits] = useState<number | null>(null);
  const [plan, setPlan] = useState<string>("");

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (typeof d.credits === "number") setCredits(d.credits);
        if (d.tenant?.plan) setPlan(d.tenant.plan);
      });
  }, []);

  if (credits === null || credits > 50) return null;

  return (
    <div className="flex items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
      <span className="flex items-center gap-2">
        <Zap className="size-4" />
        {credits <= 0
          ? "You're out of credits. Scout and outreach are blocked until you top up."
          : `Only ${credits} credits left — consider topping up before your next scout.`}
      </span>
      <Link href="/settings?tab=billing" className="shrink-0 font-semibold underline">
        Billing
      </Link>
    </div>
  );
}

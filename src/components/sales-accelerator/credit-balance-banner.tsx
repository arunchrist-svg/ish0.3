"use client";

import Link from "next/link";
import { Zap } from "lucide-react";
import { useSession } from "@/components/providers/session-provider";

export function CreditBalanceBanner() {
  const { session, loading } = useSession();

  if (loading || !session) return null;

  const credits = session.credits;
  const plan = session.tenant.plan ?? "";

  if (credits > 50) return null;

  return (
    <div className="hidden lg:flex items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
      <span className="flex items-center gap-2">
        <Zap className="size-4" />
        {credits <= 0
          ? "You're out of credits. Scout and outreach are blocked until you top up."
          : `Only ${credits} credits left. Consider topping up before your next scout.`}
      </span>
      <Link href="/settings?tab=billing" className="shrink-0 font-semibold underline">
        Billing
      </Link>
    </div>
  );
}

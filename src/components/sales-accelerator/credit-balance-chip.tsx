"use client";

import Link from "next/link";
import { Coins } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSession } from "@/components/providers/session-provider";

type CreditBalanceChipProps = {
  compact?: boolean;
  className?: string;
  onNavigate?: () => void;
};

export function CreditBalanceChip({ compact = false, className, onNavigate }: CreditBalanceChipProps) {
  const { session, loading } = useSession();
  if (loading || !session) return null;

  const credits = session.credits;
  const empty = credits <= 0;
  const low = credits <= 50;
  const canManage = session.permissions.canManageBilling;

  const content = (
    <>
      <Coins
        className={cn(
          "size-3.5 shrink-0",
          empty ? "text-red-600" : low ? "text-amber-600" : "text-brand-stratus-yellow",
        )}
      />
      {compact ? credits.toLocaleString("en-IN") : `${credits.toLocaleString("en-IN")} credits`}
    </>
  );

  const chipClass = cn(
    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-semibold tabular-nums shadow-[var(--shadow-brand-sm)]",
    empty
      ? "border-red-200 bg-red-50 text-red-800"
      : low
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : "border-brand-border bg-white text-brand-ink",
    canManage && !empty && !low ? "hover:bg-brand-canvas" : null,
    className,
  );

  if (!canManage) {
    return (
      <span title="Workspace credit balance" className={chipClass}>
        {content}
      </span>
    );
  }

  return (
    <Link
      href="/settings?tab=billing"
      onClick={onNavigate}
      title="Workspace credit balance"
      className={chipClass}
    >
      {content}
    </Link>
  );
}

"use client";

import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Pin, RefreshCw, Search, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export type ActionLoaderVariant = "enrich" | "refresh" | "pin";

type Props = {
  variant: ActionLoaderVariant;
  contactName?: string;
  className?: string;
  compact?: boolean;
};

const CONFIG: Record<
  ActionLoaderVariant,
  { icon: LucideIcon; hints: string[]; message: (name?: string) => string }
> = {
  enrich: {
    icon: Search,
    hints: [
      "Scanning public directories",
      "Verifying email confidence",
      "Cross-checking company records",
    ],
    message: (name) => (name ? `Finding email for ${name}` : "Finding email"),
  },
  refresh: {
    icon: RefreshCw,
    hints: [
      "Syncing lead details",
      "Updating pipeline status",
      "Refreshing enrichment data",
    ],
    message: () => "Refreshing lead",
  },
  pin: {
    icon: Pin,
    hints: ["Updating your quick access list"],
    message: () => "Saving pin",
  },
};

export function ActionLoader({ variant, contactName, className, compact }: Props) {
  const [hintIndex, setHintIndex] = useState(0);
  const { icon: Icon, hints, message } = CONFIG[variant];
  const label = message(contactName);

  useEffect(() => {
    if (hints.length <= 1) return;
    const id = setInterval(() => {
      setHintIndex((i) => (i + 1) % hints.length);
    }, 2200);
    return () => clearInterval(id);
  }, [hints.length]);

  if (compact) {
    return (
      <div
        className={cn("flex flex-col items-center px-4 py-6 animate-d365-in", className)}
        role="status"
        aria-live="polite"
        aria-label={label}
      >
        <div className="relative mb-4 flex size-14 items-center justify-center">
          <span className="absolute inset-0 rounded-full border border-brand-yellow/40 animate-brand-radar" />
          <span className="absolute inset-1 rounded-full border border-brand-green/20 animate-brand-radar [animation-delay:0.7s]" />
          <div className="relative z-10 flex size-9 items-center justify-center rounded-xl bg-brand-yellow-gradient shadow-[var(--shadow-brand-yellow-sm)] animate-brand-float">
            <Icon className="size-4 text-brand-ink" strokeWidth={2.25} />
          </div>
        </div>
        <p className="text-center text-[13px] font-semibold text-brand-ink">
          {label}
          <span className="inline-flex w-[1.1em]">
            <span className="animate-brand-dot [animation-delay:0ms]">.</span>
            <span className="animate-brand-dot [animation-delay:180ms]">.</span>
            <span className="animate-brand-dot [animation-delay:360ms]">.</span>
          </span>
        </p>
        <p key={hintIndex} className="mt-2 flex items-center gap-1.5 text-[11px] text-brand-ink-faint animate-d365-in">
          <Sparkles className="size-3 shrink-0 text-brand-green" strokeWidth={2.5} />
          {hints[hintIndex]}
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl bg-white/90 px-8 py-10 shadow-[var(--shadow-brand-md)] animate-d365-in",
        className,
      )}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div className="relative mb-6 flex size-[72px] items-center justify-center">
        <span className="absolute inset-0 rounded-full border border-brand-yellow/40 animate-brand-radar" />
        <span className="absolute inset-1 rounded-full border border-brand-yellow/25 animate-brand-radar [animation-delay:0.6s]" />
        <span className="absolute inset-2 rounded-full border border-brand-green/20 animate-brand-radar [animation-delay:1.2s]" />

        <div className="relative z-10 flex size-11 items-center justify-center rounded-2xl bg-brand-yellow-gradient shadow-[var(--shadow-brand-yellow-sm)] animate-brand-float">
          <Icon className="size-5 text-brand-ink" strokeWidth={2.25} />
        </div>

        <span className="absolute inset-0 animate-brand-orbit">
          <span className="absolute left-1/2 top-0 size-1.5 -translate-x-1/2 rounded-full bg-brand-green shadow-[0_0_6px_rgba(63,190,130,0.6)]" />
        </span>
      </div>

      <p className="text-[15px] font-semibold tracking-tight text-brand-ink">
        {label}
        <span className="inline-flex w-[1.1em]">
          <span className="animate-brand-dot [animation-delay:0ms]">.</span>
          <span className="animate-brand-dot [animation-delay:180ms]">.</span>
          <span className="animate-brand-dot [animation-delay:360ms]">.</span>
        </span>
      </p>

      <div className="mt-4 h-1 w-44 overflow-hidden rounded-full bg-brand-border">
        <div className="h-full w-2/5 rounded-full bg-brand-yellow-gradient animate-brand-shimmer-bar" />
      </div>

      <p key={hintIndex} className="mt-3 flex items-center gap-1.5 text-[12px] text-brand-ink-faint animate-d365-in">
        <Sparkles className="size-3 shrink-0 text-brand-green" strokeWidth={2.5} />
        {hints[hintIndex]}
      </p>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Sparkles, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  count: number;
  progress?: { done: number; total: number };
  className?: string;
};

const SAVE_HINTS = [
  "Fetching email per enrichment settings",
  "Verifying email format & MX records",
  "Checking gifting relevance",
  "Adding contacts to your leads queue",
];

export function SavingLeadsLoader({ count, progress, className }: Props) {
  const [hintIndex, setHintIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setHintIndex((i) => (i + 1) % SAVE_HINTS.length);
    }, 2200);
    return () => clearInterval(id);
  }, []);

  const label =
    count === 1 ? "1 lead" : `${count} leads`;
  const progressLabel =
    progress && progress.total > 1
      ? ` (${progress.done} of ${progress.total} companies)`
      : "";

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-6 py-16 animate-d365-in",
        className,
      )}
      role="status"
      aria-live="polite"
      aria-label={`Adding ${label} to CRM`}
    >
      <div className="relative mb-6 flex size-[80px] items-center justify-center">
        <span className="absolute inset-0 rounded-full border-2 border-ish-green/30 animate-ish-radar" />
        <span className="absolute inset-2 rounded-full border border-ish-yellow/35 animate-ish-radar [animation-delay:0.5s]" />
        <span className="absolute inset-4 rounded-full border border-ish-green/20 animate-ish-radar [animation-delay:1s]" />

        <div className="relative z-10 flex size-12 items-center justify-center rounded-2xl bg-ish-green text-white shadow-[var(--shadow-ish)] animate-ish-float">
          <UserPlus className="size-6" strokeWidth={2.25} />
        </div>

        <span className="absolute -right-1 top-1 z-20 flex size-6 items-center justify-center rounded-full bg-ish-yellow shadow-[var(--shadow-ish-yellow-sm)] animate-ish-orbit [animation-duration:3s]">
          <Sparkles className="size-3 text-ish-ink" strokeWidth={2.5} />
        </span>
        <span className="absolute -left-1 bottom-1 z-20 flex size-5 items-center justify-center rounded-full bg-white shadow-[var(--shadow-ish-sm)] animate-ish-orbit [animation-duration:4s] [animation-direction:reverse]">
          <CheckCircle2 className="size-3 text-ish-green" strokeWidth={2.5} />
        </span>
      </div>

      <p className="text-center text-[16px] font-bold tracking-tight text-ish-ink">
        Adding {label} to CRM
        <span className="inline-flex w-[1.1em]">
          <span className="animate-ish-dot [animation-delay:0ms]">.</span>
          <span className="animate-ish-dot [animation-delay:180ms]">.</span>
          <span className="animate-ish-dot [animation-delay:360ms]">.</span>
        </span>
      </p>

      {progressLabel ? (
        <p className="mt-1 text-[12px] font-medium text-ish-ink-soft">{progressLabel.trim()}</p>
      ) : null}

      <div className="mt-5 h-1.5 w-52 overflow-hidden rounded-full bg-ish-border">
        <div
          className="h-full rounded-full bg-gradient-to-r from-ish-green to-ish-yellow transition-all duration-500 ease-out animate-ish-shimmer-bar"
          style={{
            width:
              progress && progress.total > 0
                ? `${Math.max(12, (progress.done / progress.total) * 100)}%`
                : "40%",
          }}
        />
      </div>

      <p
        key={hintIndex}
        className="mt-4 flex items-center gap-1.5 text-[12.5px] text-ish-ink-faint animate-d365-in"
      >
        <Sparkles className="size-3.5 shrink-0 text-ish-yellow" strokeWidth={2.5} />
        {SAVE_HINTS[hintIndex]}
      </p>
    </div>
  );
}

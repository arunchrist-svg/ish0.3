"use client";

import { useEffect, useState } from "react";
import { Building2, Radar } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  message?: string;
  hints?: string[];
  className?: string;
  compact?: boolean;
  progress?: { done: number; total: number };
};

const DEFAULT_HINTS = [
  "Scanning company directories",
  "Matching industries & cities",
  "Ranking by fit for outreach",
];

export function DiscoveringLoader({
  message = "Discovering companies",
  hints = DEFAULT_HINTS,
  className,
  compact = false,
  progress,
}: Props) {
  const [hintIndex, setHintIndex] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    if (hints.length <= 1) return;
    const id = setInterval(() => {
      setHintIndex((i) => (i + 1) % hints.length);
    }, 2400);
    return () => clearInterval(id);
  }, [hints]);

  useEffect(() => {
    setElapsedSec(0);
    const id = setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [message, progress?.total]);

  const pct =
    progress && progress.total > 0
      ? Math.max(progress.done > 0 ? 8 : 4, (progress.done / progress.total) * 100)
      : undefined;

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center animate-d365-in",
        compact ? "py-12" : "h-full px-6",
        className,
      )}
      role="status"
      aria-live="polite"
      aria-label={message}
    >
      <div className="relative mb-6 flex size-[72px] items-center justify-center">
        <span className="absolute inset-0 rounded-full border border-brand-yellow/40 animate-brand-radar" />
        <span className="absolute inset-1 rounded-full border border-brand-yellow/25 animate-brand-radar [animation-delay:0.6s]" />
        <span className="absolute inset-2 rounded-full border border-brand-green/20 animate-brand-radar [animation-delay:1.2s]" />

        <div className="relative z-10 flex size-11 items-center justify-center rounded-2xl bg-brand-yellow-gradient shadow-[var(--shadow-brand-yellow-sm)] animate-brand-float">
          <Building2 className="size-5 text-brand-ink" strokeWidth={2.25} />
        </div>

        <span className="absolute inset-0 animate-brand-orbit">
          <span className="absolute left-1/2 top-0 size-1.5 -translate-x-1/2 rounded-full bg-brand-green shadow-[0_0_6px_rgba(63,190,130,0.6)]" />
        </span>
      </div>

      <p className="text-[15px] font-semibold tracking-tight text-brand-ink">
        {message}
        <span className="inline-flex w-[1.1em]">
          <span className="animate-brand-dot [animation-delay:0ms]">.</span>
          <span className="animate-brand-dot [animation-delay:180ms]">.</span>
          <span className="animate-brand-dot [animation-delay:360ms]">.</span>
        </span>
      </p>

      {progress && progress.total > 0 ? (
        <p className="mt-1 text-[12px] font-medium text-brand-ink-soft">
          {progress.done === 0
            ? `Starting search across ${progress.total} companies · ${elapsedSec}s`
            : `${progress.done} of ${progress.total} done · ${elapsedSec}s`}
        </p>
      ) : null}

      <div className="mt-4 h-1.5 w-52 overflow-hidden rounded-full bg-brand-border">
        <div
          className={cn(
            "h-full rounded-full bg-brand-yellow-gradient transition-all duration-500 ease-out",
            pct == null && "w-2/5 animate-brand-shimmer-bar",
          )}
          style={pct != null ? { width: `${pct}%` } : undefined}
        />
      </div>

      <p
        key={hintIndex}
        className="mt-3 flex items-center gap-1.5 text-[12px] text-brand-ink-faint animate-d365-in"
      >
        <Radar className="size-3 shrink-0 text-brand-green" strokeWidth={2.5} />
        {hints[hintIndex]}
      </p>
    </div>
  );
}

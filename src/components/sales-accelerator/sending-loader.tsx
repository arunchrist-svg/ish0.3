"use client";

import { useEffect, useState } from "react";
import { CalendarClock, Mail, Send } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  contactName?: string;
  contactEmail?: string;
  className?: string;
};

const DEFAULT_HINTS = [
  "Locking in your subject line",
  "Scheduling follow-ups on your cadence",
  "Starting your outreach sequence",
];

export function SendingLoader({ contactName, contactEmail, className }: Props) {
  const [hintIndex, setHintIndex] = useState(0);

  const hints = contactEmail
    ? DEFAULT_HINTS.map((h) =>
        h === "Starting your outreach sequence"
          ? `Delivering to ${contactEmail}`
          : h,
      )
    : DEFAULT_HINTS;

  useEffect(() => {
    if (hints.length <= 1) return;
    const id = setInterval(() => {
      setHintIndex((i) => (i + 1) % hints.length);
    }, 2200);
    return () => clearInterval(id);
  }, [hints]);

  const message = contactName
    ? `Sending to ${contactName}`
    : "Launching outreach";

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-6 py-10 animate-d365-in",
        className,
      )}
      role="status"
      aria-live="polite"
      aria-label={message}
    >
      <div className="relative mb-6 flex size-[72px] items-center justify-center">
        <span className="absolute inset-0 rounded-full border border-brand-stratus-blue/35 animate-brand-radar" />
        <span className="absolute inset-1 rounded-full border border-brand-green/25 animate-brand-radar [animation-delay:0.6s]" />
        <span className="absolute inset-2 rounded-full border border-brand-yellow/30 animate-brand-radar [animation-delay:1.2s]" />

        <div className="relative z-10 flex size-11 items-center justify-center rounded-2xl bg-brand-black shadow-[var(--shadow-brand-sm)] animate-brand-float">
          <Send className="size-5 text-white" strokeWidth={2.25} />
        </div>

        <span className="absolute inset-0 animate-brand-orbit">
          <span className="absolute left-1/2 top-0 size-1.5 -translate-x-1/2 rounded-full bg-brand-stratus-blue shadow-[0_0_6px_rgba(131,162,219,0.7)]" />
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

      <div className="mt-4 h-1 w-44 overflow-hidden rounded-full bg-brand-border">
        <div className="h-full w-2/5 rounded-full bg-gradient-to-r from-brand-stratus-blue via-brand-green to-brand-yellow animate-brand-shimmer-bar" />
      </div>

      <p
        key={hintIndex}
        className="mt-3 flex items-center gap-1.5 text-[12px] text-brand-ink-faint animate-d365-in"
      >
        <CalendarClock className="size-3 shrink-0 text-brand-stratus-blue" strokeWidth={2.5} />
        {hints[hintIndex]}
      </p>

      <p className="mt-4 flex items-center gap-1.5 text-[11px] font-medium text-brand-ink-soft">
        <Mail className="size-3 text-brand-ink-faint" />
        Sequence started
      </p>
    </div>
  );
}

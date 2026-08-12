"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/design-system";
import { contentQualityLabel } from "@/lib/email/content-quality-score";
import { getContentScoreFixTips } from "@/lib/email/content-score-fixes";
import { deliverabilityVerdict } from "@/lib/agents/writer-scoring";
import { cn } from "@/lib/utils";

type Props = {
  inboxScore?: number;
  factors?: { label: string; delta: number }[];
  className?: string;
};

function verdictFromScore(score: number) {
  return deliverabilityVerdict(score) === "PASS"
    ? "SAFE"
    : deliverabilityVerdict(score) === "MARGINAL"
      ? "CAUTION"
      : "RISK";
}

function verdictTone(verdict: "SAFE" | "CAUTION" | "RISK") {
  if (verdict === "SAFE") return "text-brand-stratus-blue";
  if (verdict === "CAUTION") return "text-brand-stratus-yellow";
  return "text-brand-stratus-salmon";
}

function shortLabel(verdict: "SAFE" | "CAUTION" | "RISK") {
  if (verdict === "SAFE") return "Good";
  if (verdict === "CAUTION") return "Review";
  return "Risk";
}

function ringTone(verdict: "SAFE" | "CAUTION" | "RISK") {
  if (verdict === "SAFE") return "ring-brand-stratus-blue/40 bg-brand-green-soft/80";
  if (verdict === "CAUTION") return "ring-brand-stratus-yellow/50 bg-brand-yellow-soft";
  return "ring-brand-stratus-salmon/45 bg-brand-pink-soft/70";
}

const STRATUS_TOOLTIP =
  "flex max-w-[280px] flex-col items-start gap-1.5 rounded-xl border border-brand-stratus-blue/25 bg-white/95 px-3 py-2.5 text-[11px] leading-relaxed text-brand-ink shadow-[var(--shadow-brand)] backdrop-blur-md [&_[class*='rotate-45']]:border-brand-stratus-blue/25 [&_[class*='rotate-45']]:bg-white [&_[class*='rotate-45']]:fill-white";

export function SpamMeter({ inboxScore = 0, factors = [], className }: Props) {
  const verdict = verdictFromScore(inboxScore);
  const label = contentQualityLabel(verdict as "SAFE" | "CAUTION" | "RISK");
  const fixTips = getContentScoreFixTips(factors);

  const tone = verdict as "SAFE" | "CAUTION" | "RISK";

  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        className={cn(
          "inline-flex h-6 shrink-0 cursor-help items-center gap-1.5 rounded-full px-1 outline-none",
          "hover:bg-brand-canvas/80 focus-visible:ring-2 focus-visible:ring-brand-stratus-blue/25",
          className,
        )}
        aria-label={`Content score ${inboxScore}, ${label}`}
      >
        <span
          className={cn(
            "flex size-[22px] items-center justify-center rounded-full text-[10px] font-extrabold tabular-nums text-brand-ink ring-1",
            ringTone(tone),
          )}
        >
          {inboxScore}
        </span>
        <span className={cn("whitespace-nowrap text-[11px] font-semibold", verdictTone(tone))}>
          {shortLabel(tone)}
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className={STRATUS_TOOLTIP}>
        <p className="font-semibold text-brand-ink">
          {inboxScore} · {label}
        </p>
        <p className="text-brand-ink-soft">
          Wording, structure, and formatting. Not SPF, DKIM, DMARC, or domain reputation.
        </p>
        {fixTips.length > 0 ? (
          <div className="mt-1 w-full space-y-1.5 border-t border-brand-border/60 pt-1.5">
            <p className="font-semibold text-brand-ink">How to improve</p>
            <ul className="space-y-1 text-brand-ink-soft">
              {fixTips.slice(0, 4).map((tip) => (
                <li key={tip.issue} className="leading-snug">
                  <span className="text-brand-stratus-salmon">−</span> {tip.fix}
                </li>
              ))}
            </ul>
            <p className="text-[10px] text-brand-ink-faint">
              Use <span className="font-semibold text-brand-ink">Make Content score higher</span> in Edit with AI to auto-fix.
            </p>
          </div>
        ) : inboxScore >= 80 ? (
          <p className="mt-1 text-brand-green">Copy looks clean for primary inbox.</p>
        ) : null}
      </TooltipContent>
    </Tooltip>
  );
}

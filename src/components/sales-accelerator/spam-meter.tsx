"use client";

import { ScoreGauge, Tooltip, TooltipContent, TooltipTrigger } from "@/design-system";
import { contentQualityLabel } from "@/lib/email/content-quality-score";
import { getContentScoreFixTips } from "@/lib/email/content-score-fixes";
import { deliverabilityVerdict } from "@/lib/agents/writer-scoring";
import { cn } from "@/lib/utils";
import { Info } from "lucide-react";

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
  if (verdict === "SAFE") return "text-ish-stratus-blue";
  if (verdict === "CAUTION") return "text-ish-stratus-yellow";
  return "text-ish-stratus-salmon";
}

const STRATUS_TOOLTIP =
  "flex max-w-[280px] flex-col items-start gap-1.5 rounded-xl border border-ish-stratus-blue/25 bg-white/95 px-3 py-2.5 text-[11px] leading-relaxed text-ish-ink shadow-[var(--shadow-ish)] backdrop-blur-md [&_[class*='rotate-45']]:border-ish-stratus-blue/25 [&_[class*='rotate-45']]:bg-white [&_[class*='rotate-45']]:fill-white";

export function SpamMeter({ inboxScore = 0, factors = [], className }: Props) {
  const verdict = verdictFromScore(inboxScore);
  const label = contentQualityLabel(verdict as "SAFE" | "CAUTION" | "RISK");
  const fixTips = getContentScoreFixTips(factors);

  return (
    <Tooltip>
      <TooltipTrigger>
        <div
          className={cn(
            "inline-flex shrink-0 cursor-help items-center gap-2 rounded-full border border-ish-stratus-blue/30 bg-white/90 px-2 py-1 shadow-[var(--shadow-ish-sm)] backdrop-blur-sm transition-colors hover:border-ish-stratus-blue/45",
            className,
          )}
        >
          <ScoreGauge score={inboxScore} size="sm" className="-my-0.5 scale-[0.88]" />
          <div className="min-w-0 leading-none">
            <span className="block text-[8px] font-bold uppercase tracking-[0.14em] text-ish-ink-faint">
              Content score
            </span>
            <span className={cn("text-[11px] font-bold", verdictTone(verdict as "SAFE" | "CAUTION" | "RISK"))}>
              {label} · {inboxScore}
            </span>
          </div>
          <Info className="size-3 shrink-0 text-ish-stratus-blue/70" aria-hidden />
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className={STRATUS_TOOLTIP}>
        <p className="font-semibold text-ish-ink">Content score only</p>
        <p className="text-ish-ink-soft">
          Wording, structure, and formatting — not SPF/DKIM/DMARC or domain reputation.
        </p>
        {fixTips.length > 0 ? (
          <div className="mt-1 w-full space-y-1.5 border-t border-ish-border/60 pt-1.5">
            <p className="font-semibold text-ish-ink">How to improve</p>
            <ul className="space-y-1 text-ish-ink-soft">
              {fixTips.slice(0, 4).map((tip) => (
                <li key={tip.issue} className="leading-snug">
                  <span className="text-ish-stratus-salmon">−</span> {tip.fix}
                </li>
              ))}
            </ul>
            <p className="text-[10px] text-ish-ink-faint">
              Use <span className="font-semibold text-ish-ink">Make Content score higher</span> in Edit with AI to auto-fix.
            </p>
          </div>
        ) : inboxScore >= 80 ? (
          <p className="mt-1 text-ish-green">Copy looks clean for primary inbox.</p>
        ) : null}
      </TooltipContent>
    </Tooltip>
  );
}

"use client";

import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  getLeadabilityLabel,
  getLeadabilitySummary,
  getLeadabilityTooltip,
  type LeadabilityMeta,
} from "@/lib/scout/leadability";

function leadabilityClasses(band?: LeadabilityMeta["leadabilityBand"]) {
  switch (band) {
    case "high":
      return "border-brand-green/20 bg-brand-green/10 text-brand-green";
    case "medium":
      return "border-brand-yellow/40 bg-brand-yellow/25 text-brand-ink";
    case "low":
      return "border-brand-border bg-brand-canvas text-brand-ink-soft";
    default:
      return "";
  }
}

type Props = LeadabilityMeta & {
  compact?: boolean;
  showSummary?: boolean;
  className?: string;
};

export function LeadabilityBadge({
  leadabilityBand,
  leadabilityScore,
  leadabilityMatchedPeople,
  leadabilityMatchedInCity,
  leadabilityProbeSource,
  compact = false,
  showSummary = false,
  className,
}: Props) {
  const meta = {
    leadabilityBand,
    leadabilityScore,
    leadabilityMatchedPeople,
    leadabilityMatchedInCity,
    leadabilityProbeSource,
  };
  const label = getLeadabilityLabel(leadabilityBand);
  const summary = getLeadabilitySummary(meta);
  const tooltip = getLeadabilityTooltip(meta);

  if (!label) return null;

  const badge = (
    <Badge
      variant="outline"
      className={cn(
        "max-w-full gap-1 rounded-full px-2.5 py-1 text-left font-semibold shadow-none",
        compact ? "h-auto text-[9px]" : "h-auto text-[10.5px]",
        leadabilityClasses(leadabilityBand),
        className,
      )}
    >
      <span className="truncate">{label}</span>
      {showSummary && summary ? (
        <span className={cn("truncate font-medium opacity-75", compact ? "hidden" : "inline")}>
          · {summary}
        </span>
      ) : null}
    </Badge>
  );

  if (!tooltip) return badge;

  return (
    <TooltipProvider delay={150}>
      <Tooltip>
        <TooltipTrigger render={<span className="max-w-full cursor-help" />}>{badge}</TooltipTrigger>
        <TooltipContent className="max-w-[240px] text-[11px] leading-snug">{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

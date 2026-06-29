"use client";

import Link from "next/link";
import { MapPin, Sparkles } from "lucide-react";
import { IshAvatar, ScoreBadge } from "@/design-system";
import { cn } from "@/lib/utils";
import type { LeadQueueItem } from "@/lib/api-client";
import type { PipelineStageAccent } from "@/lib/pipeline-status";

type Props = {
  lead: LeadQueueItem;
  index: number;
  accent: PipelineStageAccent;
};

function emailStatusDot(status: string) {
  if (status === "verified") return "bg-ish-green";
  if (status === "unverified") return "bg-[#e8a000]";
  return "bg-ish-ink-faint";
}

export function BoardLeadCard({ lead, index, accent }: Props) {
  return (
    <Link
      href={`/leads?lead=${lead.id}`}
      className="ish-board-lead-card group block overflow-hidden rounded-[16px] transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5"
    >
      <div
        className={cn(
          "ish-board-lead-card-accent pointer-events-none h-1",
          accent === "blue" && "ish-board-accent-blue",
          accent === "yellow" && "ish-board-accent-yellow",
          accent === "salmon" && "ish-board-accent-salmon",
          accent === "muted" && "ish-board-accent-muted",
        )}
        aria-hidden
      />

      <div className="p-3.5">
        <div className="mb-2.5 flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13.5px] font-bold leading-tight text-ish-ink">{lead.name}</div>
            <div className="mt-0.5 truncate text-[11.5px] text-ish-ink-soft">{lead.company}</div>
          </div>
          <ScoreBadge score={lead.score ?? 0} />
        </div>

        <div className="mb-2.5 flex items-center gap-1 text-[10.5px] text-ish-ink-faint">
          <MapPin className="size-3 shrink-0" />
          <span className="truncate">{lead.city}</span>
        </div>

        <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-ish-green">
          <Sparkles className="size-3 shrink-0" />
          <span className="truncate">{lead.action}</span>
        </div>

        <div className="mt-3 flex items-center justify-between gap-2 border-t border-black/[0.04] pt-2.5">
          <div className="flex items-center gap-2">
            <span
              className={cn("size-2 shrink-0 rounded-full", emailStatusDot(lead.emailStatus))}
              title={lead.emailStatus}
            />
            <span className="text-[10px] font-medium capitalize text-ish-ink-faint">{lead.emailStatus}</span>
          </div>
          <IshAvatar name={lead.name} index={index} size={26} />
        </div>
      </div>
    </Link>
  );
}

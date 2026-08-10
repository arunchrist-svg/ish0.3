"use client";

import Link from "next/link";
import { MapPin } from "lucide-react";
import { IshAvatar, ScoreBadge } from "@/design-system";
import { cn } from "@/lib/utils";
import type { LeadQueueItem } from "@/lib/api-client";
import { statusToDisplayLabel, type PipelineStageAccent } from "@/lib/pipeline-status";

type Props = {
  lead: LeadQueueItem;
  index: number;
  accent: PipelineStageAccent;
};

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
            <div className="truncate text-[13.5px] font-bold leading-tight text-brand-ink">{lead.name}</div>
            <div className="mt-0.5 truncate text-[11.5px] text-brand-ink-soft">{lead.company}</div>
          </div>
          <ScoreBadge score={lead.score ?? 0} />
        </div>

        {lead.employees && lead.employees !== "—" ? (
          <div className="mb-2.5 truncate text-[10.5px] text-brand-ink-faint">
            {/employee/i.test(lead.employees) ? lead.employees : `${lead.employees} employees`}
          </div>
        ) : (
          <div className="mb-2.5 flex items-center gap-1 text-[10.5px] text-brand-ink-faint">
            <MapPin className="size-3 shrink-0" />
            <span className="truncate">{lead.city}</span>
          </div>
        )}

        <div className="mt-3 flex items-center justify-between gap-2 border-t border-black/[0.04] pt-2.5">
          <span className="rounded-md bg-brand-canvas px-2 py-0.5 text-[10px] font-bold text-brand-ink-soft">
            {statusToDisplayLabel(lead.status)}
          </span>
          <IshAvatar name={lead.name} index={index} size={26} />
        </div>
      </div>
    </Link>
  );
}

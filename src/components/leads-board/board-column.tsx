"use client";

import type { LeadQueueItem } from "@/lib/api-client";
import {
  PIPELINE_STAGE_ACCENTS,
  type PipelineStageLabel,
} from "@/lib/pipeline-status";
import { BoardLeadCard } from "./board-lead-card";

type Props = {
  stage: PipelineStageLabel;
  leads: LeadQueueItem[];
};

export function BoardColumn({ stage, leads }: Props) {
  const accent = PIPELINE_STAGE_ACCENTS[stage];

  return (
    <section className="ish-board-column flex w-[280px] shrink-0 flex-col rounded-[18px]">
      <header className="ish-board-column-header mb-3 flex shrink-0 items-center justify-between gap-2 px-1">
        <h2 className="truncate text-[12.5px] font-bold text-ish-ink">{stage}</h2>
        <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-bold tabular-nums text-ish-ink-faint">
          {leads.length}
        </span>
      </header>

      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-0.5 pb-1 scrollbar-none">
        {leads.length === 0 ? (
          <div className="rounded-xl border border-dashed border-ish-border/60 px-3 py-8 text-center text-[11px] text-ish-ink-faint">
            No leads
          </div>
        ) : (
          leads.map((lead, i) => (
            <BoardLeadCard key={lead.id} lead={lead} index={i} accent={accent} />
          ))
        )}
      </div>
    </section>
  );
}

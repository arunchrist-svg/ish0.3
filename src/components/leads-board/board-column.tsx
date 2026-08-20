"use client";

import { Loader2 } from "lucide-react";
import type { LeadQueueItem } from "@/lib/api-client";
import {
  PIPELINE_STAGE_ACCENTS,
  type PipelineStageLabel,
} from "@/lib/pipeline-status";
import { cn } from "@/lib/utils";
import { BoardLeadCard } from "./board-lead-card";
import type { SendQueueItem } from "./board-bulk-actions";

type ColumnAction = {
  label: string;
  busyLabel: string;
  busy: boolean;
  disabled?: boolean;
  onClick: () => void;
  onCancel?: () => void;
};

type Props = {
  stage: PipelineStageLabel;
  leads: LeadQueueItem[];
  action?: ColumnAction;
  queueByLeadId?: Record<string, SendQueueItem>;
};

export function BoardColumn({ stage, leads, action, queueByLeadId }: Props) {
  const accent = PIPELINE_STAGE_ACCENTS[stage];

  return (
    <section className="ish-board-column flex w-[280px] shrink-0 flex-col rounded-[18px]">
      <header className="ish-board-column-header mb-3 shrink-0 space-y-2 px-1">
        <div className="flex items-center justify-between gap-2">
          <h2 className="truncate text-[12.5px] font-bold text-brand-ink">{stage}</h2>
          <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-bold tabular-nums text-brand-ink-faint">
            {leads.length}
          </span>
        </div>
        {action ? (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={action.onClick}
              disabled={action.disabled || action.busy || leads.length === 0}
              className={cn(
                "flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[10.5px] font-semibold transition-all",
                "border-brand-border/70 bg-white/80 text-brand-ink",
                "hover:border-brand-ink/25 hover:bg-white active:scale-[0.98]",
                "disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100",
              )}
            >
              {action.busy ? (
                <Loader2 className="size-3 shrink-0 animate-spin text-brand-stratus-blue" />
              ) : null}
              <span className="truncate">{action.busy ? action.busyLabel : action.label}</span>
            </button>
            {action.busy && action.onCancel ? (
              <button
                type="button"
                onClick={action.onCancel}
                className="shrink-0 rounded-full border border-brand-border/70 bg-white/80 px-2.5 py-1.5 text-[10.5px] font-semibold text-brand-ink-soft transition-all hover:border-red-300 hover:text-red-600 active:scale-[0.98]"
              >
                Cancel
              </button>
            ) : null}
          </div>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-0.5 pb-1 scrollbar-none">
        {leads.length === 0 ? (
          <div className="rounded-xl border border-dashed border-brand-border/60 px-3 py-8 text-center text-[11px] text-brand-ink-faint">
            No leads
          </div>
        ) : (
          leads.map((lead, i) => (
            <BoardLeadCard
              key={lead.id}
              lead={lead}
              index={i}
              accent={accent}
              sendStatus={queueByLeadId?.[lead.id]}
            />
          ))
        )}
      </div>
    </section>
  );
}

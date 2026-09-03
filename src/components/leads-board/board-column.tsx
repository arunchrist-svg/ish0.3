"use client";

import React from "react";
import { Loader2 } from "lucide-react";
import type { LeadQueueItem } from "@/lib/api-client";
import {
  PIPELINE_STAGE_ACCENTS,
  type PipelineStageLabel,
} from "@/lib/pipeline-status";
import { cn } from "@/lib/utils";
import { TruncatedText } from "@/design-system";
import { BoardLeadCard } from "./board-lead-card";
import type { SendQueueItem } from "./board-bulk-actions";
import { VirtualList } from "@/components/ui/virtual-list";

type ColumnAction = {
  label: string;
  busyLabel: string;
  busy: boolean;
  disabled?: boolean;
  onClick: () => void;
  onCancel?: () => void;
  accessory?: React.ReactNode;
};

type Props = {
  stage: PipelineStageLabel;
  leads: LeadQueueItem[];
  action?: ColumnAction;
  queueByLeadId?: Record<string, SendQueueItem>;
  queueItems?: SendQueueItem[];
  onLeadOpen?: (lead: LeadQueueItem) => void;
};

function queueStatusLabel(item: SendQueueItem): string {
  switch (item.status) {
    case "waiting":
      return item.gapMinutes ? `Waiting ${item.gapMinutes}m` : "Waiting";
    case "sending":
      return "Sending";
    case "sent":
      return "Sent";
    case "failed":
      return "Failed";
    case "cancelled":
      return "Cancelled";
    default:
      return "Queued";
  }
}

export function BoardColumn({ stage, leads, action, queueByLeadId, queueItems, onLeadOpen }: Props) {
  const accent = PIPELINE_STAGE_ACCENTS[stage];
  const useVirtual = leads.length > 40;

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
            {action.accessory}
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
        {queueItems?.length ? (
          <ul className="max-h-36 space-y-1 overflow-y-auto rounded-xl border border-[#e8ebf1] bg-[#ffffff] p-1.5">
            {queueItems.map((item) => (
              <li
                key={item.leadId}
                className="flex items-center justify-between gap-2 rounded-lg px-2 py-1"
                title={item.error}
              >
                <div className="min-w-0 flex-1">
                  <TruncatedText
                    text={item.name}
                    className="text-[11px] font-medium text-brand-ink"
                  />
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-md px-1.5 py-0.5 text-[9.5px] font-bold tabular-nums",
                    item.status === "sent" && "bg-brand-green-soft text-brand-green",
                    item.status === "failed" && "bg-red-50 text-red-600",
                    item.status === "sending" && "bg-brand-stratus-blue/12 text-brand-stratus-blue",
                    item.status === "waiting" && "bg-brand-stratus-yellow/25 text-brand-ink",
                    (item.status === "queued" || item.status === "cancelled") &&
                      "bg-brand-canvas text-brand-ink-soft",
                  )}
                >
                  {queueStatusLabel(item)}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </header>

      {leads.length === 0 ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-0.5 pb-1">
          <div className="rounded-xl border border-dashed border-brand-border/60 px-3 py-8 text-center text-[11px] text-brand-ink-faint">
            No leads
          </div>
        </div>
      ) : useVirtual ? (
        <VirtualList
          items={leads}
          estimateSize={88}
          overscan={6}
          className="min-h-0 flex-1 px-0.5 pb-1 scrollbar-none"
          getItemKey={(lead) => lead.id}
          renderItem={(lead, i) => (
            <div className="pb-2.5">
              <BoardLeadCard
                lead={lead}
                index={i}
                accent={accent}
                stage={stage}
                sendStatus={queueByLeadId?.[lead.id]}
                onOpen={onLeadOpen}
              />
            </div>
          )}
        />
      ) : (
        <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-0.5 pb-1 scrollbar-none">
          {leads.map((lead, i) => (
            <BoardLeadCard
              key={lead.id}
              lead={lead}
              index={i}
              accent={accent}
              stage={stage}
              sendStatus={queueByLeadId?.[lead.id]}
              onOpen={onLeadOpen}
            />
          ))}
        </div>
      )}
    </section>
  );
}

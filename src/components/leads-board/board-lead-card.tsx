"use client";

import Link from "next/link";
import { Check, Clock, Loader2, MapPin, X } from "lucide-react";
import { IshAvatar, ScoreBadge } from "@/design-system";
import { cn } from "@/lib/utils";
import type { LeadQueueItem } from "@/lib/api-client";
import { LeadAddedByLabel } from "@/components/leads/lead-added-by-button";
import { statusToDisplayLabel, type PipelineStageAccent } from "@/lib/pipeline-status";
import type { SendQueueItem } from "./board-bulk-actions";

type Props = {
  lead: LeadQueueItem;
  index: number;
  accent: PipelineStageAccent;
  stage?: string;
  sendStatus?: SendQueueItem;
};

type CardSendBadge = {
  label: string;
  tone: "queued" | "waiting" | "sending" | "sent" | "failed" | "idle";
};

function queueBadge(item: SendQueueItem): CardSendBadge {
  switch (item.status) {
    case "waiting":
      return {
        label: item.gapMinutes ? `Sends in ${item.gapMinutes}m` : "Waiting",
        tone: "waiting",
      };
    case "sending":
      return { label: "Sending", tone: "sending" };
    case "sent":
      return { label: "Sent", tone: "sent" };
    case "failed":
      return { label: "Failed", tone: "failed" };
    case "cancelled":
      return { label: "Not sent", tone: "idle" };
    default:
      return { label: "Queued", tone: "queued" };
  }
}

function cardSendBadge(
  lead: LeadQueueItem,
  stage: string | undefined,
  sendStatus?: SendQueueItem,
): CardSendBadge | null {
  if (sendStatus) return queueBadge(sendStatus);
  if (stage === "Email") return { label: "Not sent", tone: "idle" };
  if (stage === "Email Sent" || lead.status === "outreached") {
    return { label: "Sent", tone: "sent" };
  }
  return null;
}

export function BoardLeadCard({ lead, index, accent, stage, sendStatus }: Props) {
  const badge = cardSendBadge(lead, stage, sendStatus);
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
          <div className="flex shrink-0 flex-col items-end gap-1">
            <ScoreBadge score={lead.score ?? 0} />
            <LeadAddedByLabel name={lead.createdByName} leadSource={lead.leadSource} />
          </div>
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
          <span
            className={cn(
              "inline-flex min-w-0 items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold",
              badge?.tone === "sent" && "bg-brand-green-soft text-brand-green",
              badge?.tone === "failed" && "bg-red-50 text-red-600",
              badge?.tone === "sending" && "bg-brand-stratus-blue/12 text-brand-stratus-blue",
              badge?.tone === "waiting" && "bg-brand-stratus-yellow/25 text-brand-ink",
              (badge?.tone === "queued" || badge?.tone === "idle" || !badge) &&
                "bg-brand-canvas text-brand-ink-soft",
            )}
            title={sendStatus?.error}
          >
            {badge?.tone === "sending" ? <Loader2 className="size-2.5 animate-spin" /> : null}
            {badge?.tone === "waiting" ? <Clock className="size-2.5" /> : null}
            {badge?.tone === "sent" ? <Check className="size-2.5" /> : null}
            {badge?.tone === "failed" ? <X className="size-2.5" /> : null}
            <span className="truncate">{badge?.label ?? statusToDisplayLabel(lead.status)}</span>
          </span>
          <IshAvatar name={lead.name} index={index} size={26} />
        </div>
      </div>
    </Link>
  );
}

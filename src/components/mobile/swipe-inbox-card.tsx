"use client";

import Link from "next/link";
import { Check, ChevronRight, Send, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { IshAvatar } from "@/design-system";
import type { LeadEmailRow } from "@/app/api/email/overview/route";

type SwipeInboxCardProps = {
  row: LeadEmailRow;
  tab: "needs_review" | "replies";
  onApprove?: (row: LeadEmailRow) => Promise<void>;
  onReject?: (row: LeadEmailRow) => Promise<void>;
  onSend?: (row: LeadEmailRow) => Promise<void>;
  busy?: boolean;
  index?: number;
};

function previewText(row: LeadEmailRow, tab: "needs_review" | "replies"): string {
  if (tab === "replies") return row.inboundSnippet ?? row.draftPreview ?? "New reply received";
  return row.draftPreview ?? "Draft ready for your review";
}

function isActionableReview(row: LeadEmailRow): boolean {
  return Boolean(row.draftOutreachId || row.pendingFollowUpScheduleId);
}

export function SwipeInboxCard({ row, tab, onApprove, onSend, busy, index = 0 }: SwipeInboxCardProps) {
  const href = `/leads?lead=${row.leadId}&tab=email`;
  const followUp = Boolean(row.pendingFollowUpScheduleId || row.isFollowUpReview);
  const showActions = tab === "needs_review" && isActionableReview(row);
  const isReply = tab === "replies";

  const accentClass = isReply
    ? "ish-inbox-accent-reply"
    : followUp
      ? "ish-inbox-accent-followup"
      : "ish-inbox-accent-review";

  return (
    <article className={cn("ish-inbox-card", busy && "pointer-events-none opacity-55")}>
      <div className={cn("ish-inbox-card-accent", accentClass)} aria-hidden />

      <div className="p-4">
        <div className="flex items-start gap-3">
          <IshAvatar name={row.contactName} index={index} size={48} className="shadow-brand-sm ring-2 ring-white" />

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="truncate text-[16px] font-bold tracking-tight text-brand-ink">{row.contactName}</h3>
                <p className="truncate text-[13px] font-medium text-brand-ink-soft">{row.companyName}</p>
              </div>
              <Link
                href={href}
                className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/80 text-brand-ink-soft shadow-brand-sm ring-1 ring-brand-border/50 active:scale-95"
                aria-label="Open lead"
              >
                <ChevronRight className="size-4" />
              </Link>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {isReply ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-brand-pink-soft px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-brand-stratus-salmon ring-1 ring-brand-stratus-salmon/20">
                  <Sparkles className="size-3" />
                  Hot reply
                </span>
              ) : null}
              {followUp ? (
                <span className="inline-flex rounded-full bg-brand-green-soft px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-brand-stratus-blue ring-1 ring-brand-stratus-blue/20">
                  Follow-up{row.followUpSequenceDay != null ? ` · Day ${row.followUpSequenceDay}` : ""}
                </span>
              ) : null}
              {!isReply && !followUp ? (
                <span className="inline-flex rounded-full bg-brand-yellow-soft px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-brand-ink/70 ring-1 ring-brand-stratus-yellow/30">
                  Needs review
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="ish-inbox-preview mt-3 px-3.5 py-3">
          {row.draftSubject ? (
            <p className="line-clamp-2 text-[14px] font-bold leading-snug text-brand-ink">{row.draftSubject}</p>
          ) : null}
          <p
            className={cn(
              "line-clamp-3 text-[13px] leading-relaxed text-brand-ink-soft",
              row.draftSubject && "mt-1.5",
            )}
          >
            {previewText(row, tab)}
          </p>
        </div>

        {showActions ? (
          <div className="mt-4 grid grid-cols-2 gap-2.5">
            <button
              type="button"
              disabled={busy}
              onClick={() => onApprove?.(row)}
              className="ish-inbox-btn-approve ish-touch-target flex h-12 items-center justify-center gap-2 rounded-2xl text-[15px] font-bold active:scale-[0.98] disabled:opacity-50"
            >
              <Check className="size-4 text-brand-stratus-blue" strokeWidth={2.5} />
              Approve
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onSend?.(row)}
              className="ish-inbox-btn-send ish-touch-target flex h-12 items-center justify-center gap-2 rounded-2xl text-[15px] font-bold active:scale-[0.98] disabled:opacity-50"
            >
              <Send className="size-4" />
              {followUp ? "Send follow-up" : "Send"}
            </button>
          </div>
        ) : isReply ? (
          <Link
            href={href}
            className="ish-inbox-btn-reply ish-touch-target mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-[15px] font-bold active:scale-[0.98]"
          >
            View reply
            <ChevronRight className="size-4" />
          </Link>
        ) : null}
      </div>
    </article>
  );
}

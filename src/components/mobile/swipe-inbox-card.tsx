"use client";

import Link from "next/link";
import { AlertTriangle, Check, ChevronRight, Send, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { IshAvatar } from "@/design-system";
import type { LeadEmailRow } from "@/app/api/email/overview/route";
import { draftFailsQualityGate } from "@/lib/outreach/outreach-quality";

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
  const href = `/leads?lead=${row.leadId}&tab=Email`;
  const followUp = Boolean(row.pendingFollowUpScheduleId || row.isFollowUpReview);
  const qualityBlocked = tab === "needs_review" && draftFailsQualityGate(row);
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
          <IshAvatar name={row.contactName} index={index} size={48} className="shadow-ish-sm ring-2 ring-white" />

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="truncate text-[16px] font-bold tracking-tight text-ish-ink">{row.contactName}</h3>
                <p className="truncate text-[13px] font-medium text-ish-ink-soft">{row.companyName}</p>
              </div>
              <Link
                href={href}
                className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/80 text-ish-ink-soft shadow-ish-sm ring-1 ring-ish-border/50 active:scale-95"
                aria-label="Open lead"
              >
                <ChevronRight className="size-4" />
              </Link>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {isReply ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-ish-pink-soft px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-ish-stratus-salmon ring-1 ring-ish-stratus-salmon/20">
                  <Sparkles className="size-3" />
                  Hot reply
                </span>
              ) : null}
              {followUp ? (
                <span className="inline-flex rounded-full bg-ish-green-soft px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-ish-stratus-blue ring-1 ring-ish-stratus-blue/20">
                  Follow-up{row.followUpSequenceDay != null ? ` · Day ${row.followUpSequenceDay}` : ""}
                </span>
              ) : null}
              {!isReply && !followUp ? (
                <span className="inline-flex rounded-full bg-ish-yellow-soft px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-ish-ink/70 ring-1 ring-ish-stratus-yellow/30">
                  Needs review
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="ish-inbox-preview mt-3 px-3.5 py-3">
          {row.draftSubject ? (
            <p className="line-clamp-2 text-[14px] font-bold leading-snug text-ish-ink">{row.draftSubject}</p>
          ) : null}
          <p
            className={cn(
              "line-clamp-3 text-[13px] leading-relaxed text-ish-ink-soft",
              row.draftSubject && "mt-1.5",
            )}
          >
            {previewText(row, tab)}
          </p>
        </div>

        {qualityBlocked ? (
          <div className="mt-3 flex items-start gap-2.5 rounded-2xl border border-ish-stratus-yellow/40 bg-gradient-to-br from-ish-yellow-soft/90 to-white px-3.5 py-3 shadow-ish-yellow-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-700" />
            <p className="text-[13px] font-medium leading-snug text-ish-ink">
              {row.revisionTimeout
                ? "Writer timed out before quality passed."
                : `Quality scores are low (inbox ${row.deliverabilityScore ?? "?"}, rubric ${row.rubricTotal ?? "?"}).`}
              {" "}Tap Send to confirm anyway.
            </p>
          </div>
        ) : null}

        {showActions ? (
          <div className="mt-4 grid grid-cols-2 gap-2.5">
            <button
              type="button"
              disabled={busy}
              onClick={() => onApprove?.(row)}
              className="ish-inbox-btn-approve ish-touch-target flex h-12 items-center justify-center gap-2 rounded-2xl text-[15px] font-bold active:scale-[0.98] disabled:opacity-50"
            >
              <Check className="size-4 text-ish-stratus-blue" strokeWidth={2.5} />
              Approve
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onSend?.(row)}
              className={cn(
                "ish-touch-target flex h-12 items-center justify-center gap-2 rounded-2xl text-[15px] font-bold active:scale-[0.98] disabled:opacity-50",
                qualityBlocked ? "bg-amber-600 text-white shadow-md" : "ish-inbox-btn-send",
              )}
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

"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Check, ChevronRight, Send, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LeadEmailRow } from "@/app/api/email/overview/route";

type SwipeInboxCardProps = {
  row: LeadEmailRow;
  tab: "needs_review" | "replies";
  onApprove?: (row: LeadEmailRow) => Promise<void>;
  onReject?: (row: LeadEmailRow) => Promise<void>;
  onSend?: (row: LeadEmailRow) => Promise<void>;
  busy?: boolean;
};

function previewText(row: LeadEmailRow, tab: "needs_review" | "replies"): string {
  if (tab === "replies") return row.inboundSnippet ?? row.draftPreview ?? "New reply received";
  return row.draftPreview ?? row.draftSubject ?? "Draft ready for review";
}

export function SwipeInboxCard({ row, tab, onApprove, onReject, onSend, busy }: SwipeInboxCardProps) {
  const [offsetX, setOffsetX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);
  const href = `/leads?lead=${row.leadId}&tab=Email`;

  const canSwipeActions = tab === "needs_review" && Boolean(row.draftOutreachId) && onApprove;

  function onTouchStart(e: React.TouchEvent) {
    if (!canSwipeActions) return;
    startX.current = e.touches[0].clientX;
    setDragging(true);
  }

  function onTouchMove(e: React.TouchEvent) {
    if (!dragging) return;
    const dx = e.touches[0].clientX - startX.current;
    setOffsetX(Math.max(-120, Math.min(120, dx)));
  }

  function onTouchEnd() {
    if (!dragging) return;
    setDragging(false);
    if (offsetX > 72 && onApprove) void onApprove(row).finally(() => setOffsetX(0));
    else if (offsetX < -72 && onReject) void onReject(row).finally(() => setOffsetX(0));
    else setOffsetX(0);
  }

  return (
    <div className="relative overflow-hidden rounded-[20px]">
      {canSwipeActions ? (
        <div className="pointer-events-none absolute inset-0 flex items-stretch justify-between px-2">
          <div className="flex w-24 items-center justify-center rounded-l-[20px] bg-ish-green text-white">
            <Check className="size-6" />
          </div>
          <div className="flex w-24 items-center justify-center rounded-r-[20px] bg-ish-stratus-salmon text-white">
            <X className="size-6" />
          </div>
        </div>
      ) : null}

      <div
        className={cn(
          "relative rounded-[20px] bg-white p-4 shadow-[var(--shadow-ish-sm)] ring-1 ring-black/[0.04] transition-transform",
          dragging ? "duration-0" : "duration-200",
          busy && "opacity-60",
        )}
        style={canSwipeActions ? { transform: `translateX(${offsetX}px)` } : undefined}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div className="flex items-start gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-ish-yellow-soft text-sm font-bold text-ish-ink">
            {row.contactName
              .split(" ")
              .map((w) => w[0])
              .join("")
              .slice(0, 2)
              .toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-[15px] font-bold text-ish-ink">{row.contactName}</div>
                <div className="truncate text-xs text-ish-ink-soft">{row.companyName}</div>
              </div>
              <Link href={href} className="shrink-0 rounded-full p-1 active:scale-95" aria-label="Open lead">
                <ChevronRight className="size-4 text-ish-ink-faint" />
              </Link>
            </div>
            <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-ish-ink-soft">{previewText(row, tab)}</p>
            {row.draftSubject ? (
              <div className="mt-2 truncate text-xs font-semibold text-ish-ink">{row.draftSubject}</div>
            ) : null}
          </div>
        </div>

        {tab === "needs_review" && row.draftOutreachId ? (
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => onApprove?.(row)}
              className="flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-ish-black text-[12px] font-semibold text-white active:scale-[0.98] disabled:opacity-50"
            >
              <Check className="size-3.5" /> Approve
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onSend?.(row)}
              className="flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-ish-stratus-blue text-[12px] font-semibold text-white active:scale-[0.98] disabled:opacity-50"
            >
              <Send className="size-3.5" /> Send
            </button>
          </div>
        ) : null}

        {canSwipeActions ? (
          <p className="mt-2 text-center text-[10px] font-medium text-ish-ink-faint">Swipe right to approve · left to reject</p>
        ) : null}
      </div>
    </div>
  );
}

"use client";

import { Loader2, Mail } from "lucide-react";
import { AppModal } from "@/components/ui/app-modal";
import { cn } from "@/lib/utils";
import type { SendQueueItem } from "./board-bulk-actions";

export type SendAllPhase = "confirm" | "sending" | "done";

type Props = {
  open: boolean;
  leadCount: number;
  /** Unqueued Email cards that still need a usable To address. */
  needEmailCount?: number;
  /** Leads already in the outbox queue (Send All appends after these). */
  queuedCount?: number;
  phase: SendAllPhase;
  sendQueue: SendQueueItem[];
  result?: {
    ok: number;
    failed: number;
    cancelled: number;
    planSpanDays?: number;
    sequencerProcessed?: number;
    errors?: string[];
  } | null;
  sendingLabel?: string;
  onSend: () => void;
  onCancelSend: () => void;
  onClose: () => void;
};

function queueProgress(queue: SendQueueItem[]): { done: number; total: number; label: string } {
  const total = queue.length;
  if (!total) return { done: 0, total: 0, label: "Queuing sends…" };
  const done = queue.filter(
    (item) => item.status === "sent" || item.status === "failed" || item.status === "cancelled",
  ).length;
  const sending = queue.find((item) => item.status === "sending");
  if (sending) {
    const name = sending.name.trim();
    if (/\d/.test(name) && /of|scheduled|leads/i.test(name)) {
      return { done, total, label: name.includes("…") || name.endsWith(".") ? name : `${name}…` };
    }
    return { done, total, label: `Scheduling ${name}…` };
  }
  const waiting = queue.find((item) => item.status === "waiting");
  if (waiting?.gapMinutes) {
    return { done, total, label: `Waiting ${waiting.gapMinutes}m · ${done} of ${total}` };
  }
  const queued = queue.filter((item) => item.status === "queued").length;
  if (queued > 0 && done < total) {
    return { done, total, label: `Queued ${queued} of ${total}` };
  }
  return { done, total, label: `${done} of ${total} scheduled` };
}

export function SendAllModal({
  open,
  leadCount,
  needEmailCount = 0,
  queuedCount = 0,
  phase,
  sendQueue,
  result,
  onSend,
  onCancelSend,
  onClose,
  sendingLabel,
}: Props) {
  const sending = phase === "sending";
  const progress = queueProgress(sendQueue);
  const statusLabel = sendingLabel ?? progress.label;

  return (
    <AppModal open={open} onClose={sending ? undefined : onClose} panelClassName="lg:max-w-lg">
      <div className="pr-8">
        <h2 className="text-[17px] font-bold tracking-tight text-brand-ink">Send all emails</h2>
        <p className="mt-1 text-[13px] text-brand-ink-soft">
          {leadCount === 1
            ? "1 ready email in Email"
            : `${leadCount.toLocaleString()} ready emails in Email`}
          {needEmailCount > 0
            ? ` · ${needEmailCount.toLocaleString()} need an email`
            : null}
          {queuedCount > 0
            ? ` · ${queuedCount.toLocaleString()} already queued`
            : null}
        </p>
      </div>

      {phase === "confirm" ? (
        <>
          <div className="mt-5 space-y-3 rounded-2xl border border-brand-border/70 bg-brand-app/40 px-4 py-3.5">
            <p className="text-[12px] font-semibold text-brand-ink">How Send All works</p>
            <ul className="space-y-2 text-[12px] leading-relaxed text-brand-ink-soft">
              <li>
                Adds every Email lead with a usable To address to the Queued column with a scheduled
                send time (your timeline).
              </li>
              {needEmailCount > 0 ? (
                <li>
                  Cards without a real inbox stay in Email. Open the card, add an email, then Send All
                  again.
                </li>
              ) : null}
              <li>
                New sends are scheduled after any leads already in the queue, with a random gap of
                30 seconds to 3 minutes between each email.
              </li>
              <li>
                Sends only during your Settings send hours and timezone (morning and evening blocks).
              </li>
              <li>Respects your daily send cap. Extra emails roll to the next allowed day.</li>
              <li>Each Queued card shows when that email is planned to go out.</li>
              <li>
                After queueing, any due or overdue sends go out right away. The rest wait for your
                send window.
              </li>
            </ul>
          </div>

          <p className="mt-4 text-[12px] text-brand-ink-soft">
            You can cancel from the Queued column before send time, or use Send due now for overdue
            sends.
          </p>

          <div className="mt-5 flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-full border border-brand-border/70 bg-white px-3 py-2.5 text-[13px] font-semibold text-brand-ink-soft transition-colors hover:border-brand-ink/20 hover:text-brand-ink"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={leadCount === 0}
              onClick={onSend}
              className={cn(
                "flex-1 rounded-full border border-brand-stratus-blue/30 bg-brand-stratus-blue px-3 py-2.5 text-[13px] font-semibold text-white transition-colors",
                "hover:bg-brand-stratus-blue/90",
                "disabled:cursor-not-allowed disabled:opacity-50",
              )}
            >
              Send all
            </button>
          </div>
        </>
      ) : null}

      {phase === "sending" ? (
        <div className="mt-6 flex flex-col items-center px-2 py-4 text-center">
          <div className="relative mb-5 flex size-16 items-center justify-center rounded-2xl bg-brand-stratus-blue/10">
            <Mail className="size-7 text-brand-stratus-blue" strokeWidth={2} />
            <Loader2 className="absolute -right-1 -top-1 size-5 animate-spin text-brand-stratus-blue" />
          </div>
          <p className="text-[15px] font-semibold text-brand-ink">{statusLabel}</p>
          {progress.total > 1 ? (
            <div className="mt-4 h-1.5 w-44 overflow-hidden rounded-full bg-brand-border">
              <div
                className="h-full rounded-full bg-brand-stratus-blue transition-[width] duration-300"
                style={{
                  width: `${Math.min(100, Math.max(4, (progress.done / progress.total) * 100))}%`,
                }}
              />
            </div>
          ) : null}
          <p className="mt-3 text-[12px] text-brand-ink-soft">
            {queuedCount > 0
              ? `New sends are added after the ${queuedCount.toLocaleString()} already in Queued. Progress updates as each email is scheduled.`
              : "Building your send schedule from Settings. Progress updates as each email is scheduled."}
          </p>
          <button
            type="button"
            onClick={onCancelSend}
            className="mt-4 rounded-full border border-red-200 bg-red-50/80 px-4 py-2 text-[12px] font-semibold text-red-700 transition-colors hover:border-red-300"
          >
            Cancel
          </button>
        </div>
      ) : null}

      {phase === "done" ? (
        <div className="mt-6 space-y-4">
          <p className="text-[14px] font-semibold text-brand-ink">
            {result && result.cancelled > 0 && result.ok === 0
              ? "Send cancelled"
              : result && result.failed === 0 && result.cancelled === 0
                ? result.ok === 1
                  ? "Queued 1 email for your send window"
                  : `Queued ${result.ok.toLocaleString()} emails${
                      result.planSpanDays && result.planSpanDays > 1
                        ? ` across ${result.planSpanDays} days`
                        : ""
                    }`
                : `Queued ${result?.ok ?? 0}${
                    result?.failed ? `, ${result.failed} failed` : ""
                  }${result?.cancelled ? `, ${result.cancelled} cancelled` : ""}`}
          </p>
          {result && result.ok > 0 ? (
            <p className="text-[12px] text-brand-ink-soft">
              {result.sequencerProcessed && result.sequencerProcessed > 0
                ? `${result.sequencerProcessed.toLocaleString()} due emails were sent. `
                : null}
              Check the Queued column for scheduled send times. The board refreshes as emails go out.
            </p>
          ) : null}
          {result?.errors && result.errors.length > 0 ? (
            <ul className="space-y-1 rounded-xl border border-red-100 bg-red-50/70 px-3 py-2.5 text-[12px] leading-relaxed text-red-800">
              {result.errors.slice(0, 5).map((err) => (
                <li key={err}>{err}</li>
              ))}
            </ul>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-full border border-brand-stratus-blue/30 bg-brand-stratus-blue px-3 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-brand-stratus-blue/90"
          >
            Done
          </button>
        </div>
      ) : null}
    </AppModal>
  );
}

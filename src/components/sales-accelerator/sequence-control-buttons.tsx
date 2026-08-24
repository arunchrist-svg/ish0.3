"use client";

import { useRef, useState } from "react";
import { Loader2, Pause, Play, RotateCcw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { controlLeadSequence, type SequenceControlState } from "@/lib/api-client";
import { toast } from "sonner";
import { AppModal } from "@/components/ui/app-modal";
import { Button } from "@/design-system";

type Props = {
  leadId: string;
  sequenceState: SequenceControlState;
  disabled?: boolean;
  sending?: boolean;
  /** Hide Start when the toolbar already has Send (same action). */
  hideStart?: boolean;
  onUpdated: (meta?: { action: "start" | "pause" | "cancel" | "reset" }) => void;
  onStartSequence?: () => void | Promise<void>;
};

const btnClass =
  "inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[11px] font-semibold transition-all disabled:opacity-50";

export function SequenceControlButtons({
  leadId,
  sequenceState,
  disabled,
  sending,
  hideStart,
  onUpdated,
  onStartSequence,
}: Props) {
  const [loading, setLoading] = useState<"start" | "pause" | "cancel" | "reset" | null>(null);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const inflightRef = useRef(false);

  async function run(action: "start" | "pause" | "cancel" | "reset") {
    if (inflightRef.current || loading !== null) return;
    if (action === "start" && sequenceState === "not_started") {
      inflightRef.current = true;
      setLoading("start");
      try {
        await onStartSequence?.();
      } finally {
        inflightRef.current = false;
        setLoading(null);
      }
      return;
    }
    inflightRef.current = true;
    setLoading(action);
    try {
      const result = await controlLeadSequence(leadId, action);
      const labels = {
        start: "Sequence resumed",
        pause: "Sequence paused",
        cancel: "Follow-ups cancelled",
        reset: "Outreach cleared",
      };
      toast.success(labels[action], {
        description:
          action === "reset"
            ? "You can write Email 1 again"
            : result.updated > 0
              ? `${result.updated} email(s) updated`
              : undefined,
      });
      onUpdated({ action });
      if (action === "reset") setResetConfirmOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update sequence");
    } finally {
      inflightRef.current = false;
      setLoading(null);
    }
  }

  const startBusy = loading === "start" || Boolean(sending);

  const showRestart = sequenceState === "cancelled" || sequenceState === "complete" || sequenceState === "active" || sequenceState === "paused";

  return (
    <>
      <div className="flex shrink-0 items-center gap-1">
        {sequenceState === "not_started" && !hideStart ? (
          <button
            type="button"
            disabled={disabled || loading !== null || Boolean(sending)}
            onClick={() => void run("start")}
            title="Send Email 1 and start the follow-up sequence"
            className={cn(btnClass, "ish-scout-cta-blue hover:opacity-95")}
          >
            {startBusy ? <Loader2 className="size-3 animate-spin" /> : <Play className="size-3" />}
            {startBusy ? "Sending…" : "Start"}
          </button>
        ) : null}
        {sequenceState === "paused" ? (
          <button
            type="button"
            disabled={disabled || loading !== null || Boolean(sending)}
            onClick={() => void run("start")}
            title="Resume scheduled follow-ups"
            className={cn(btnClass, "ish-scout-ghost hover:opacity-95")}
          >
            {loading === "start" ? <Loader2 className="size-3 animate-spin" /> : <Play className="size-3" />}
            {loading === "start" ? "Resuming…" : "Resume"}
          </button>
        ) : null}
        {sequenceState === "active" && (
          <button
            type="button"
            disabled={disabled || loading !== null}
            onClick={() => void run("pause")}
            className={cn(btnClass, "ish-scout-ghost hover:opacity-95")}
          >
            {loading === "pause" ? <Loader2 className="size-3 animate-spin" /> : <Pause className="size-3" />}
            Pause
          </button>
        )}
        {(sequenceState === "active" || sequenceState === "paused") && (
          <button
            type="button"
            disabled={disabled || loading !== null}
            onClick={() => void run("cancel")}
            className={cn(
              btnClass,
              "bg-white/80 text-brand-stratus-salmon shadow-[inset_0_0_0_1px_rgba(var(--brand-stratus-salmon-rgb),0.35)] hover:bg-brand-pink-soft/40",
            )}
          >
            {loading === "cancel" ? <Loader2 className="size-3 animate-spin" /> : <X className="size-3" />}
            Cancel
          </button>
        )}
        {sequenceState === "cancelled" ? (
          <span className="px-1 text-[10px] font-medium text-brand-ink-faint">Follow-ups cancelled</span>
        ) : null}
        {showRestart ? (
          <button
            type="button"
            disabled={disabled || loading !== null}
            onClick={() => setResetConfirmOpen(true)}
            className={cn(btnClass, "ish-scout-ghost hover:opacity-95")}
            title="Clear outreach and rewrite from Email 1"
          >
            {loading === "reset" ? <Loader2 className="size-3 animate-spin" /> : <RotateCcw className="size-3" />}
            Restart
          </button>
        ) : null}
      </div>

      <AppModal open={resetConfirmOpen} onClose={() => setResetConfirmOpen(false)} panelClassName="max-w-md">
        <div className="text-[16px] font-bold text-brand-ink">Restart from Email 1?</div>
        <p className="mt-2 text-[13px] leading-relaxed text-brand-ink-soft">
          This clears sent history, scheduled follow-ups, and drafts for this lead so you can write and send Email 1
          again. Emails already delivered to the recipient are not recalled.
        </p>
        <div className="mt-5 flex justify-end gap-2 border-t border-brand-border/60 pt-4">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-auto rounded-[14px] border border-brand-border px-4 py-2 text-[12px] font-semibold"
            onClick={() => setResetConfirmOpen(false)}
            disabled={loading === "reset"}
          >
            Keep outreach
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-auto rounded-[14px] bg-brand-black px-4 py-2 text-[12px] font-semibold text-white"
            disabled={loading === "reset"}
            onClick={() => void run("reset")}
          >
            {loading === "reset" ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="size-3.5 animate-spin" />
                Clearing...
              </span>
            ) : (
              "Restart from Email 1"
            )}
          </Button>
        </div>
      </AppModal>
    </>
  );
}

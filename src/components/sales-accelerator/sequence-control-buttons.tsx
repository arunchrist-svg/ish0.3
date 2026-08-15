"use client";

import { useState } from "react";
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
  onUpdated: () => void;
  onStartSequence?: () => void;
};

const btnClass =
  "inline-flex h-6 items-center gap-1 rounded-full border px-2.5 text-[11px] font-semibold transition-opacity disabled:opacity-50";

export function SequenceControlButtons({
  leadId,
  sequenceState,
  disabled,
  onUpdated,
  onStartSequence,
}: Props) {
  const [loading, setLoading] = useState<"start" | "pause" | "cancel" | "reset" | null>(null);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  async function run(action: "start" | "pause" | "cancel" | "reset") {
    if (action === "start" && sequenceState === "not_started") {
      onStartSequence?.();
      return;
    }
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
      onUpdated();
      if (action === "reset") setResetConfirmOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update sequence");
    } finally {
      setLoading(null);
    }
  }

  const showRestart = sequenceState === "cancelled" || sequenceState === "complete" || sequenceState === "active" || sequenceState === "paused";

  return (
    <>
      <div className="flex shrink-0 items-center gap-1.5">
        {(sequenceState === "not_started" || sequenceState === "paused") && (
          <button
            type="button"
            disabled={disabled || loading !== null}
            onClick={() => void run("start")}
            className={cn(btnClass, "border-brand-stratus-blue/30 bg-brand-green-soft text-brand-stratus-blue hover:opacity-90")}
          >
            {loading === "start" ? <Loader2 className="size-3 animate-spin" /> : <Play className="size-3" />}
            {sequenceState === "not_started" ? "Start" : "Resume"}
          </button>
        )}
        {sequenceState === "active" && (
          <button
            type="button"
            disabled={disabled || loading !== null}
            onClick={() => void run("pause")}
            className={cn(btnClass, "border-brand-border bg-white text-brand-ink hover:bg-brand-canvas")}
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
            className={cn(btnClass, "border-brand-stratus-salmon/30 bg-brand-pink-soft/40 text-brand-stratus-salmon hover:opacity-90")}
          >
            {loading === "cancel" ? <Loader2 className="size-3 animate-spin" /> : <X className="size-3" />}
            Cancel
          </button>
        )}
        {sequenceState === "cancelled" ? (
          <span className="text-[10px] font-medium text-brand-ink-faint">Follow-ups cancelled</span>
        ) : null}
        {showRestart ? (
          <button
            type="button"
            disabled={disabled || loading !== null}
            onClick={() => setResetConfirmOpen(true)}
            className={cn(btnClass, "border-brand-border bg-white text-brand-ink hover:bg-brand-canvas")}
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

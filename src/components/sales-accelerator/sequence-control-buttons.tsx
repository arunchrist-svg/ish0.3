"use client";

import { useState } from "react";
import { Loader2, Pause, Play, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { controlLeadSequence, type SequenceControlState } from "@/lib/api-client";
import { toast } from "sonner";

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
  const [loading, setLoading] = useState<"start" | "pause" | "cancel" | null>(null);

  async function run(action: "start" | "pause" | "cancel") {
    if (action === "start" && sequenceState === "not_started") {
      onStartSequence?.();
      return;
    }
    setLoading(action);
    try {
      const result = await controlLeadSequence(leadId, action);
      const labels = { start: "Sequence resumed", pause: "Sequence paused", cancel: "Follow-ups cancelled" };
      toast.success(labels[action], {
        description: result.updated > 0 ? `${result.updated} email(s) updated` : undefined,
      });
      onUpdated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update sequence");
    } finally {
      setLoading(null);
    }
  }

  if (sequenceState === "complete") return null;

  return (
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
      {sequenceState === "cancelled" && (
        <span className="text-[10px] font-medium text-brand-ink-faint">Follow-ups cancelled</span>
      )}
    </div>
  );
}

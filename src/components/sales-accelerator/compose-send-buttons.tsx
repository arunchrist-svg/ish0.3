"use client";

import { CalendarClock, Loader2, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ComposeActionState } from "./outreach-approval-card";

type Props = {
  composeActions: ComposeActionState | null;
  onSendNow: () => void;
  onScheduleSend: () => void;
  className?: string;
};

export function ComposeSendButtons({
  composeActions,
  onSendNow,
  onScheduleSend,
  className,
}: Props) {
  if (!composeActions) return null;

  const disabled = !composeActions.canSend || composeActions.sending;

  if (!composeActions.showDualSend) {
    return (
      <button
        type="button"
        onClick={onSendNow}
        disabled={disabled}
        className={cn(
          "inline-flex h-7 min-w-[4.5rem] shrink-0 items-center justify-center gap-1 rounded-full px-3 text-[11px] font-semibold transition-opacity",
          composeActions.canSend ? "ish-scout-cta-blue hover:opacity-95" : "ish-scout-cta-muted",
          className,
        )}
      >
        {composeActions.sending ? <Loader2 className="size-3 animate-spin" /> : <Send className="size-3" />}
        {composeActions.sending ? "Sending…" : composeActions.sendNowLabel}
      </button>
    );
  }

  return (
    <div className={cn("inline-flex shrink-0 items-center gap-1", className)}>
      <button
        type="button"
        onClick={onScheduleSend}
        disabled={disabled}
        className={cn(
          "inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-[11px] font-semibold transition-opacity",
          composeActions.canSend
            ? "border-black/[0.12] bg-white text-brand-ink hover:bg-black/[0.03]"
            : "cursor-not-allowed border-black/[0.06] bg-black/[0.02] text-brand-ink-faint",
        )}
      >
        {composeActions.sending ? (
          <Loader2 className="size-3 animate-spin" />
        ) : (
          <CalendarClock className="size-3" />
        )}
        {composeActions.sending ? "Saving…" : composeActions.scheduleSendLabel}
      </button>
      <button
        type="button"
        onClick={onSendNow}
        disabled={disabled}
        className={cn(
          "inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[11px] font-semibold text-white transition-opacity",
          composeActions.canSend ? "bg-brand-black hover:opacity-90" : "cursor-not-allowed bg-brand-ink-faint/50",
        )}
      >
        {composeActions.sending ? <Loader2 className="size-3 animate-spin" /> : <Send className="size-3" />}
        {composeActions.sending ? "Sending…" : composeActions.sendNowLabel}
      </button>
    </div>
  );
}

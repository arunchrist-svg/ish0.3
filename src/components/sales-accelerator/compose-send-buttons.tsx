"use client";

import type { ReactNode } from "react";
import { CalendarClock, Loader2, Send } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/design-system";
import { cn } from "@/lib/utils";
import type { ComposeActionState } from "./outreach-approval-card";

type Props = {
  composeActions: ComposeActionState | null;
  onSendNow: () => void;
  onScheduleSend: () => void;
  className?: string;
  /** Compact header control: icon + tooltip, no visible label. */
  iconOnly?: boolean;
};

const STRATUS_TOOLTIP =
  "rounded-xl border border-brand-stratus-blue/25 bg-white/95 px-2.5 py-1.5 text-[11px] font-semibold text-brand-ink shadow-[var(--shadow-brand)] backdrop-blur-md [&_[class*='rotate-45']]:border-brand-stratus-blue/25 [&_[class*='rotate-45']]:bg-white [&_[class*='rotate-45']]:fill-white";

function IconActionButton({
  label,
  onClick,
  disabled,
  className,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        className={cn(
          "inline-flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold transition-opacity disabled:cursor-not-allowed",
          className,
        )}
      >
        {children}
      </TooltipTrigger>
      <TooltipContent side="bottom" className={STRATUS_TOOLTIP}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

export function ComposeSendButtons({
  composeActions,
  onSendNow,
  onScheduleSend,
  className,
  iconOnly = false,
}: Props) {
  if (!composeActions) return null;

  const disabled = !composeActions.canSend || composeActions.sending;
  const sendNowLabel = composeActions.sending ? "Sending…" : composeActions.sendNowLabel;
  const scheduleSendLabel = composeActions.sending ? "Saving…" : composeActions.scheduleSendLabel;

  if (iconOnly) {
    if (!composeActions.showDualSend) {
      return (
        <IconActionButton
          label={sendNowLabel}
          onClick={onSendNow}
          disabled={disabled}
          className={cn(
            composeActions.canSend ? "ish-scout-cta-blue hover:opacity-95" : "ish-scout-cta-muted",
            className,
          )}
        >
          {composeActions.sending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
        </IconActionButton>
      );
    }

    return (
      <div className={cn("inline-flex shrink-0 items-center gap-1", className)}>
        <IconActionButton
          label={scheduleSendLabel}
          onClick={onScheduleSend}
          disabled={disabled}
          className={
            composeActions.canSend
              ? "border border-black/[0.12] bg-white text-brand-ink hover:bg-black/[0.03]"
              : "cursor-not-allowed border border-black/[0.06] bg-black/[0.02] text-brand-ink-faint"
          }
        >
          {composeActions.sending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <CalendarClock className="size-3.5" />
          )}
        </IconActionButton>
        <IconActionButton
          label={sendNowLabel}
          onClick={onSendNow}
          disabled={disabled}
          className={
            composeActions.canSend
              ? "bg-brand-black text-white hover:opacity-90"
              : "cursor-not-allowed bg-brand-ink-faint/50 text-white"
          }
        >
          {composeActions.sending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
        </IconActionButton>
      </div>
    );
  }

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
        {sendNowLabel}
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
        {scheduleSendLabel}
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
        {sendNowLabel}
      </button>
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { Ban, ChevronDown, ChevronUp, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EmailThread, ThreadEvent } from "@/lib/api-client";
import {
  conversationSide,
  conversationStatusChip,
  shouldShowConversationTimeline,
} from "@/lib/email/conversation-view";

export {
  conversationSide,
  conversationStatusChip,
  shouldShowConversationTimeline,
} from "@/lib/email/conversation-view";

const LONG_BODY_CHARS = 420;

function formatWhen(at?: string): string | null {
  if (!at) return null;
  return new Date(at).toLocaleString("en-IN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function chipClass(tone: ReturnType<typeof conversationStatusChip>["tone"]): string {
  switch (tone) {
    case "opened":
      return "bg-brand-stratus-yellow/25 text-brand-ink ring-1 ring-brand-stratus-yellow/40";
    case "bounced":
      return "bg-brand-pink-soft text-brand-stratus-salmon ring-1 ring-brand-stratus-salmon/30";
    case "inbound":
      return "bg-brand-green-soft text-brand-stratus-blue ring-1 ring-brand-stratus-blue/25";
    case "outbound":
      return "bg-brand-stratus-blue/15 text-brand-stratus-blue ring-1 ring-brand-stratus-blue/25";
    case "draft":
      return "bg-brand-canvas text-brand-ink-soft ring-1 ring-brand-border";
    case "scheduled":
      return "bg-white text-brand-ink-soft ring-1 ring-brand-border";
    default:
      return "bg-brand-stratus-blue/10 text-brand-stratus-blue ring-1 ring-brand-stratus-blue/20";
  }
}

function MessageBubble({
  event,
  selected,
  onSelect,
}: {
  event: ThreadEvent;
  selected: boolean;
  onSelect?: (id: string) => void;
}) {
  const side = conversationSide(event);
  const chip = conversationStatusChip(event);
  const body = event.body ?? event.snippet ?? "";
  const isLong = body.length > LONG_BODY_CHARS;
  const [expanded, setExpanded] = useState(false);
  const shown = isLong && !expanded ? `${body.slice(0, LONG_BODY_CHARS).trimEnd()}…` : body;
  const when = formatWhen(event.at ?? event.openedAt);

  return (
    <button
      type="button"
      onClick={() => onSelect?.(event.id)}
      className={cn(
        "flex w-full flex-col gap-1.5 text-left",
        side === "them" ? "items-start" : "items-end",
      )}
    >
      <div
        className={cn(
          "max-w-[92%] rounded-[14px] border px-3 py-2.5 shadow-[var(--shadow-brand-sm)] transition-shadow sm:max-w-[78%]",
          side === "them"
            ? "border-brand-stratus-blue/15 bg-white"
            : "border-brand-stratus-blue/20 bg-brand-canvas/60",
          selected && "ring-2 ring-brand-stratus-blue/35",
        )}
      >
        <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-semibold tracking-wide text-brand-ink-faint">
          <span className="uppercase">{side === "them" ? "Them" : "Us"}</span>
          {/* Skip title when it duplicates the status chip (e.g. inbound "Their reply"). */}
          {event.label &&
          event.label.trim().toLowerCase() !== chip.label.trim().toLowerCase() ? (
            <>
              <span aria-hidden>·</span>
              <span className="text-brand-ink">{event.label}</span>
            </>
          ) : null}
          <span aria-hidden>·</span>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold normal-case tracking-normal",
              chipClass(chip.tone),
            )}
          >
            {chip.tone === "opened" ? <Eye className="size-2.5" /> : null}
            {chip.tone === "bounced" ? <Ban className="size-2.5" /> : null}
            {chip.label}
          </span>
          {when ? (
            <>
              <span aria-hidden>·</span>
              <span className="font-medium tabular-nums">{when}</span>
            </>
          ) : null}
        </div>

        {event.subject ? (
          <p className="mt-2 text-[12px] font-semibold text-brand-ink">{event.subject}</p>
        ) : null}

        {shown ? (
          <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-brand-ink-soft">{shown}</p>
        ) : (
          <p className="mt-2 text-[12px] italic text-brand-ink-faint">No body yet</p>
        )}

        {event.bouncedAt && event.bounceReason ? (
          <p className="mt-2 text-[11px] font-medium text-brand-stratus-salmon">{event.bounceReason}</p>
        ) : null}

        {isLong ? (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((v) => !v);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.stopPropagation();
                setExpanded((v) => !v);
              }
            }}
            className="mt-2 inline-flex items-center gap-0.5 text-[11px] font-semibold text-brand-stratus-blue"
          >
            {expanded ? (
              <>
                Show less <ChevronUp className="size-3" />
              </>
            ) : (
              <>
                Show more <ChevronDown className="size-3" />
              </>
            )}
          </span>
        ) : null}
      </div>
    </button>
  );
}

type Props = {
  thread?: EmailThread;
  selectedEventId?: string;
  onSelect?: (eventId: string) => void;
  /** Hide draft bubbles when the compose editor is showing the same content. */
  hideDraftEvents?: boolean;
  /**
   * Show sent/opened/bounced outbound even when there is no inbound yet.
   * Default keeps the two-sided conversation stack only.
   */
  showOutboundHistory?: boolean;
};

export function ConversationTimeline({
  thread,
  selectedEventId,
  onSelect,
  hideDraftEvents,
  showOutboundHistory,
}: Props) {
  const events = useMemo(() => {
    if (!thread) return [];
    if (!showOutboundHistory && !shouldShowConversationTimeline(thread)) return [];
    const list = [...(thread.events ?? [])].filter((e) => {
      if (!hideDraftEvents) return true;
      if (e.status === "draft") return false;
      if (e.id === "reply-draft") return false;
      return true;
    });
    list.sort((a, b) => {
      const ta = a.at ? new Date(a.at).getTime() : Number.POSITIVE_INFINITY;
      const tb = b.at ? new Date(b.at).getTime() : Number.POSITIVE_INFINITY;
      if (ta !== tb) return ta - tb;
      const order = (e: ThreadEvent) => {
        if (e.kind === "inbound_reply") return 50;
        if (e.id === "reply-draft" || e.kind === "outbound_reply") return 60;
        if (e.status === "draft") return 40 + (e.sequenceDay ?? 0);
        if (e.status === "scheduled") return 30 + (e.sequenceDay ?? 0);
        return e.sequenceDay ?? 0;
      };
      return order(a) - order(b);
    });
    return list;
  }, [thread, hideDraftEvents, showOutboundHistory]);

  if (!thread || events.length === 0) return null;

  return (
    <div className="space-y-2 rounded-[14px] border border-brand-stratus-blue/12 bg-gradient-to-b from-brand-canvas/50 to-white px-3 py-2.5 lg:px-3.5 lg:py-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-brand-ink-faint">Conversation</p>
        {thread.threadRootSubject ? (
          <p className="truncate text-[11px] font-medium text-brand-ink-soft">{thread.threadRootSubject}</p>
        ) : null}
      </div>
      <div className="flex flex-col gap-2.5">
        {events.map((event) => (
          <MessageBubble
            key={event.id}
            event={event}
            selected={selectedEventId === event.id}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}

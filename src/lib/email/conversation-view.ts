import type { BarNodeKind, EmailThread, ThreadEvent, ThreadPhase } from "@/lib/email/email-thread";

export type ConversationSide = "them" | "us";

/**
 * Two-sided conversation stack (inbound present).
 * Sent-only Email 1 preview on the Leads Email tab uses showOutboundHistory instead.
 */
export function shouldShowConversationTimeline(
  thread: Pick<EmailThread, "events"> | null | undefined,
): boolean {
  return (thread?.events ?? []).some((e) => e.kind === "inbound_reply");
}

/**
 * After Email 1 is sent/opened, the Email tab still needs a read-only body when that
 * step is selected. Compose covers draft/scheduled steps; this covers sent steps.
 */
export function shouldShowSentOutboundPreview(params: {
  composeEditorVisible: boolean;
  selectedNodeKind?: BarNodeKind;
  phase?: ThreadPhase;
}): boolean {
  if (params.composeEditorVisible) return false;
  if (params.selectedNodeKind === "sent") return true;
  return (
    params.phase === "awaiting_reply" ||
    params.phase === "complete" ||
    params.phase === "reply_sent"
  );
}

export function conversationSide(event: ThreadEvent): ConversationSide {
  return event.kind === "inbound_reply" ? "them" : "us";
}

export function conversationStatusChip(event: ThreadEvent): {
  label: string;
  tone: "draft" | "scheduled" | "sent" | "opened" | "bounced" | "inbound" | "outbound";
} {
  if (event.kind === "inbound_reply") {
    return { label: "Their reply", tone: "inbound" };
  }
  if (event.kind === "outbound_reply" && event.status !== "draft") {
    return { label: "Your reply", tone: "outbound" };
  }
  if (event.status === "bounced" || event.bouncedAt) {
    return { label: "Bounced", tone: "bounced" };
  }
  // Pixel-based; not the same as Gmail read/unread.
  if (event.status === "opened" || event.openedAt) {
    return { label: "Opened", tone: "opened" };
  }
  if (event.status === "draft" || event.kind === "draft") {
    return { label: "Draft", tone: "draft" };
  }
  if (event.status === "scheduled" || event.kind === "scheduled") {
    return { label: "Scheduled", tone: "scheduled" };
  }
  return { label: "Sent", tone: "sent" };
}

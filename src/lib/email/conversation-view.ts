import type { EmailThread, ThreadEvent } from "@/lib/email/email-thread";

export type ConversationSide = "them" | "us";

/**
 * Conversation stack is for two-sided history only.
 * While awaiting a reply, sequence progress lives on the rail chips, not this list.
 */
export function shouldShowConversationTimeline(
  thread: Pick<EmailThread, "events"> | null | undefined,
): boolean {
  return (thread?.events ?? []).some((e) => e.kind === "inbound_reply");
}

export function conversationSide(event: ThreadEvent): ConversationSide {
  return event.kind === "inbound_reply" ? "them" : "us";
}

export function conversationStatusChip(event: ThreadEvent): {
  label: string;
  tone: "draft" | "scheduled" | "sent" | "opened" | "bounced" | "inbound" | "outbound";
} {
  if (event.kind === "inbound_reply") {
    return { label: "They replied", tone: "inbound" };
  }
  if (event.kind === "outbound_reply" && event.status !== "draft") {
    return { label: "You replied", tone: "outbound" };
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

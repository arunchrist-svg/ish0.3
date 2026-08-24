import type { ThreadEvent } from "@/lib/email/email-thread";

export type ConversationSide = "them" | "us";

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

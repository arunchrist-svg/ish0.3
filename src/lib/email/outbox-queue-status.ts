export type OutboxQueueStatus = "needs_review" | "active" | "hot" | "replies" | "done";

export function classifyOutboxQueueStatus(input: {
  needsReview: boolean;
  hasInboundReply: boolean;
  leadStatus: string;
  opened: boolean;
  scheduledCount: number;
  pausedCount: number;
  sentCount: number;
}): OutboxQueueStatus {
  if (input.needsReview) return "needs_review";
  if (input.hasInboundReply) return "replies";
  if (input.opened && input.leadStatus !== "replied") return "hot";
  if (
    input.scheduledCount === 0 &&
    input.pausedCount === 0 &&
    input.sentCount > 0 &&
    input.leadStatus !== "replied"
  ) {
    return "done";
  }
  if (input.scheduledCount > 0 && input.sentCount > 0) return "active";
  if (input.pausedCount > 0 && input.scheduledCount === 0 && input.sentCount > 0) return "done";
  return "active";
}

/** Unique-open rate against sent outbound mail. */
export function emailOpenRatePercent(opened: number, sent: number): number {
  if (sent <= 0) return 0;
  return Math.round((Math.max(0, opened) / sent) * 100);
}

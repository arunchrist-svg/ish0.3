import { describe, expect, it } from "vitest";
import { classifyOutboxQueueStatus, emailOpenRatePercent } from "@/lib/email/outbox-queue-status";

describe("classifyOutboxQueueStatus", () => {
  it("puts an open without a reply in Hot even after the sequence finishes", () => {
    expect(
      classifyOutboxQueueStatus({
        needsReview: false,
        hasInboundReply: false,
        leadStatus: "outreached",
        opened: true,
        scheduledCount: 0,
        pausedCount: 0,
        sentCount: 3,
      }),
    ).toBe("hot");
  });

  it("keeps inbound replies in Replies, not Hot", () => {
    expect(
      classifyOutboxQueueStatus({
        needsReview: false,
        hasInboundReply: true,
        leadStatus: "replied",
        opened: true,
        scheduledCount: 1,
        pausedCount: 0,
        sentCount: 1,
      }),
    ).toBe("replies");
  });
});

describe("emailOpenRatePercent", () => {
  it("uses sent mail as the denominator, not every lead in the queue", () => {
    expect(emailOpenRatePercent(6, 20)).toBe(30);
    expect(emailOpenRatePercent(2, 800)).toBe(0);
    expect(emailOpenRatePercent(2, 5)).toBe(40);
    expect(emailOpenRatePercent(4, 0)).toBe(0);
  });
});

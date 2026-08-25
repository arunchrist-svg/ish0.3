import { describe, expect, it } from "vitest";
import { sumOutreachAttention } from "@/lib/email/outreach-attention-counts";

describe("outreach attention badge counts", () => {
  it("sums needs-review and unreplied replies for the sidebar badge", () => {
    expect(sumOutreachAttention(0, 0)).toBe(0);
    expect(sumOutreachAttention(3, 2)).toBe(5);
    expect(sumOutreachAttention(12, 0)).toBe(12);
  });

  it("documents badge meaning: attention items only, not active/hot/done totals", () => {
    // Badge must not include Active / Hot / Done / Logs; those are separate Outreach KPIs.
    const needsReview = 4; // Email 1 drafts + pending_review follow-ups (visible)
    const unrepliedReplies = 1;
    const active = 20;
    const hot = 3;
    const done = 8;

    const badge = sumOutreachAttention(needsReview, unrepliedReplies);
    expect(badge).toBe(5);
    expect(badge).not.toBe(needsReview + unrepliedReplies + active + hot + done);
  });
});

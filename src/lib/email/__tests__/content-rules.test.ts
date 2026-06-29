import { describe, expect, it } from "vitest";
import { scoreContentQuality } from "@/lib/email/content-quality-score";

const DIWALI_BODY = `Hi Arun,

With Diwali approaching, we're excited to offer premium pure-ghee mithai and dry fruit hampers perfect for your 120-person team at Christ Test Co. We can also provide custom-branded boxes and great bulk pricing, starting from ₹500 per person for larger orders.

Would you be open to a quick call this week to confirm quantities and delivery address?

Srilaksha`;

describe("content quality — Christ Test Co Diwali draft", () => {
  it("does not score 100 on harvesting-style first touch", () => {
    const result = scoreContentQuality(
      DIWALI_BODY,
      "Diwali gifts for Christ Test Co's team",
      {
        emailStyle: "primary",
        fromName: "Srilaksha",
        contactFirstName: "Arun",
        sequencePosition: 1,
        account: { name: "Christ Test Co" },
        contact: { firstName: "Arun" },
      },
    );
    expect(result.contentScore).toBeLessThan(80);
    expect(result.ruleHits.some((h) => h.id === "A" || h.id === "G")).toBe(true);
  });
});

describe("scoreContentQuality", () => {
  it("penalizes dear opener and spam words", () => {
    const result = scoreContentQuality(
      "Dear Arun,\n\nFree offer for your team.\n\nISH Gifting Team",
      "FREE OFFER — India Sweet House",
      { emailStyle: "marketing", hasBulkHeaders: true },
    );
    expect(result.contentScore).toBeLessThan(70);
  });
});

const SCREENSHOT_BODY = `Hi Arun,

I see that Christ Test Co is expanding its Bangalore presence — with Diwali approaching, we're offering premium pure-ghee mithai and dry fruit hampers that can elevate your corporate gifting.

Would you be open to receiving a complimentary tasting sample this week? I'd be happy to coordinate the details after your reply.

Srilaksha
India Sweet House`;

describe("content quality — screenshot-style Diwali draft", () => {
  it("flags weak opener, missing soft-exit, and thin sign-off", () => {
    const result = scoreContentQuality(
      SCREENSHOT_BODY,
      "Diwali gifting options for Christ Test Co",
      {
        emailStyle: "primary",
        fromName: "Srilaksha",
        contactFirstName: "Arun",
        sequencePosition: 1,
        account: { name: "Christ Test Co", city: "Bangalore" },
        contact: { firstName: "Arun" },
      },
    );
    expect(result.contentScore).toBeLessThan(70);
    expect(result.ruleHits.some((h) => h.id === "D")).toBe(true);
    expect(result.ruleHits.some((h) => h.id === "G")).toBe(true);
  });
});

describe("company stats in email body", () => {
  it("penalizes employee counts even when account has verified employees", () => {
    const result = scoreContentQuality(
      `Hi Priya,

With Diwali coming up, we help teams like yours with premium gifting. For your 500 employees, we can offer curated hampers.

Would a sample box help?

Arun
ISH`,
      "Diwali gifting for Test Corp",
      {
        emailStyle: "primary",
        fromName: "Arun",
        contactFirstName: "Priya",
        sequencePosition: 1,
        account: { name: "Test Corp", employees: "500", enrichmentSource: "apollo" },
        contact: { firstName: "Priya" },
      },
    );
    expect(result.ruleHits.some((h) => h.id === "B")).toBe(true);
    expect(result.contentScore).toBeLessThan(85);
  });
});


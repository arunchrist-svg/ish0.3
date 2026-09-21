import { describe, expect, it } from "vitest";
import {
  autopilotRunOutboxLabel,
  isOutboundCampaignLogRow,
} from "@/lib/email/outbound-campaign-shared";

describe("isOutboundCampaignLogRow", () => {
  it("keeps Email 1 / follow-ups and outbound replies", () => {
    expect(isOutboundCampaignLogRow({ emailKind: "initial", sequenceDay: 0, status: "sent" })).toBe(true);
    expect(isOutboundCampaignLogRow({ emailKind: "followup", sequenceDay: 3, status: "sent" })).toBe(true);
    expect(isOutboundCampaignLogRow({ emailKind: "outbound_reply", sequenceDay: -1, status: "sent" })).toBe(true);
  });

  it("drops inbound replies, DSNs, and OOO stored as sent rows", () => {
    expect(
      isOutboundCampaignLogRow({
        emailKind: "inbound_auto_reply",
        sequenceDay: -2,
        status: "sent",
      }),
    ).toBe(false);
    expect(
      isOutboundCampaignLogRow({
        emailKind: "inbound_reply",
        sequenceDay: -2,
        status: "sent",
      }),
    ).toBe(false);
    expect(isOutboundCampaignLogRow({ emailKind: null, sequenceDay: -2, status: "sent" })).toBe(false);
  });
});

describe("autopilotRunOutboxLabel", () => {
  it("names the area and lead count", () => {
    expect(
      autopilotRunOutboxLabel({
        input: { cities: ["Kasturi Nagar"] },
        progress: { leadsSaved: 36 },
      }),
    ).toBe("Kasturi Nagar · 36 leads");
  });
});

import { describe, expect, it } from "vitest";
import { deriveSequenceState } from "@/lib/outreach/sequence-control";

describe("deriveSequenceState", () => {
  it("returns not_started before email 1 is sent", () => {
    expect(deriveSequenceState("draft_ready", [{ sequenceDay: 1, status: "scheduled" }])).toBe("not_started");
  });

  it("returns active when follow-ups are scheduled", () => {
    expect(
      deriveSequenceState("outreached", [
        { sequenceDay: 0, status: "sent" },
        { sequenceDay: 3, status: "scheduled" },
      ]),
    ).toBe("active");
  });

  it("returns paused when follow-ups are paused", () => {
    expect(
      deriveSequenceState("outreached", [
        { sequenceDay: 0, status: "sent" },
        { sequenceDay: 3, status: "paused" },
      ]),
    ).toBe("paused");
  });

  it("returns cancelled when follow-ups are cancelled", () => {
    expect(
      deriveSequenceState("outreached", [
        { sequenceDay: 0, status: "sent" },
        { sequenceDay: 3, status: "cancelled" },
        { sequenceDay: 7, status: "cancelled" },
      ]),
    ).toBe("cancelled");
  });

  it("returns complete when lead replied", () => {
    expect(
      deriveSequenceState("replied", [
        { sequenceDay: 0, status: "sent" },
        { sequenceDay: 3, status: "cancelled" },
      ]),
    ).toBe("complete");
  });
});

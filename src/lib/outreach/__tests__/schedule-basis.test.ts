import { describe, expect, it } from "vitest";
import {
  effectiveDailySendCap,
  scheduleBasisChanged,
  scheduleBasisFingerprint,
} from "@/lib/outreach/schedule-basis";

describe("scheduleBasisFingerprint", () => {
  const base = {
    dailySendCapPerDomain: 58,
    inboxWarmupStage: "warming" as const,
    inboxWarmupStartedAt: "2026-08-01T00:00:00.000Z",
    sendDaysOfWeek: [6, 0] as number[],
    sendHourStart: 7,
    sendHourEnd: 11,
    sendHourRanges: [{ hourStart: 7, hourEnd: 11 }],
    sendTimezone: "Asia/Kolkata",
  };

  it("is stable for equivalent day order", () => {
    const a = scheduleBasisFingerprint(base);
    const b = scheduleBasisFingerprint({ ...base, sendDaysOfWeek: [0, 6] });
    expect(a).toBe(b);
  });

  it("changes when daily cap changes", () => {
    expect(
      scheduleBasisChanged(base, { ...base, dailySendCapPerDomain: 120 }),
    ).toBe(true);
  });

  it("changes when send hours change", () => {
    expect(
      scheduleBasisChanged(base, {
        ...base,
        sendHourRanges: [
          { hourStart: 7, hourEnd: 11 },
          { hourStart: 16, hourEnd: 18 },
        ],
      }),
    ).toBe(true);
  });

  it("changes when warmup stage changes the effective cap", () => {
    const withoutCap = { ...base, dailySendCapPerDomain: undefined };
    expect(
      scheduleBasisChanged(
        { ...withoutCap, inboxWarmupStage: "new" },
        { ...withoutCap, inboxWarmupStage: "trusted" },
      ),
    ).toBe(true);
  });

  it("is unchanged when schedule basis is identical", () => {
    expect(scheduleBasisChanged(base, { ...base })).toBe(false);
  });

  it("uses recommended cap when override is missing", () => {
    expect(
      effectiveDailySendCap({
        inboxWarmupStage: "trusted",
        inboxWarmupStartedAt: "2026-01-01T00:00:00.000Z",
      }),
    ).toBe(120);
  });
});

import { describe, expect, it } from "vitest";
import { evaluateBounceRate } from "@/lib/email/sender-bounce-rate";
import {
  assertGradualRamp,
  assertVolumeWithinCap,
  recommendedDailyCap,
  remainingDailyQuota,
  warmupCapWarning,
} from "@/lib/email/sender-warmup";

describe("evaluateBounceRate", () => {
  it("does not trip below min sample", () => {
    const r = evaluateBounceRate({ sent: 10, bounced: 5, threshold: 0.02, minSent: 20 });
    expect(r.exceedsThreshold).toBe(false);
    expect(r.rate).toBe(0.5);
  });

  it("trips at 2% with enough sends", () => {
    const r = evaluateBounceRate({ sent: 100, bounced: 2, threshold: 0.02, minSent: 20 });
    expect(r.exceedsThreshold).toBe(true);
    expect(r.rate).toBe(0.02);
  });

  it("stays under threshold", () => {
    const r = evaluateBounceRate({ sent: 100, bounced: 1, threshold: 0.02, minSent: 20 });
    expect(r.exceedsThreshold).toBe(false);
  });
});

describe("assertVolumeWithinCap", () => {
  it("allows under cap", () => {
    expect(assertVolumeWithinCap({ sendsLast24h: 10, dailyCap: 50, projectedAdditional: 5 })).toEqual({
      ok: true,
      projectedTotal: 15,
      overBy: 0,
      remaining: 40,
    });
  });

  it("blocks projected overflow", () => {
    const r = assertVolumeWithinCap({ sendsLast24h: 48, dailyCap: 50, projectedAdditional: 5 });
    expect(r.ok).toBe(false);
    expect(r.projectedTotal).toBe(53);
    expect(r.overBy).toBe(3);
    expect(r.remaining).toBe(2);
  });

  it("reports zero remaining at cap", () => {
    const r = assertVolumeWithinCap({ sendsLast24h: 30, dailyCap: 30, projectedAdditional: 1 });
    expect(r.ok).toBe(false);
    expect(r.remaining).toBe(0);
  });
});

describe("mailbox warmup ramp", () => {
  const start = "2026-01-01T00:00:00.000Z";

  it("starts new inboxes at 20 and ramps to 40 over 2 weeks", () => {
    const day0 = recommendedDailyCap({ stage: "new", warmupStartedAt: start, now: Date.parse(start) });
    expect(day0.recommended).toBe(20);
    expect(day0.min).toBe(20);
    expect(day0.max).toBe(40);

    const day13 = recommendedDailyCap({
      stage: "new",
      warmupStartedAt: start,
      now: Date.parse(start) + 13 * 24 * 60 * 60 * 1000,
    });
    expect(day13.recommended).toBe(40);
  });

  it("ramps warming inboxes toward the trusted default", () => {
    const early = recommendedDailyCap({
      stage: "warming",
      warmupStartedAt: start,
      now: Date.parse(start) + 14 * 24 * 60 * 60 * 1000,
    });
    expect(early.recommended).toBe(40);

    const late = recommendedDailyCap({
      stage: "warming",
      warmupStartedAt: start,
      now: Date.parse(start) + 27 * 24 * 60 * 60 * 1000,
    });
    expect(late.recommended).toBe(120);
    expect(late.max).toBe(150);
  });

  it("caps trusted inboxes at 100–150", () => {
    const rec = recommendedDailyCap({ stage: "trusted", warmupStartedAt: start, now: Date.parse(start) });
    expect(rec.min).toBe(100);
    expect(rec.max).toBe(150);
    expect(rec.recommended).toBe(120);
  });

  it("warns when a new-inbox cap is above 40", () => {
    const rec = recommendedDailyCap({ stage: "new" });
    expect(warmupCapWarning(150, rec)).toBe(
      "New inboxes should stay at 20–40/day for the first 2–4 weeks.",
    );
    expect(warmupCapWarning(30, rec)).toBeNull();
  });

  it("blocks a burst that jumps past the gradual ceiling", () => {
    const rec = recommendedDailyCap({ stage: "new" });
    const ramp = assertGradualRamp({
      sendsPrior24h: 10,
      projectedTotal: 90,
      projectedAdditional: 80,
      recommended: rec,
    });
    expect(ramp.ok).toBe(false);
    expect(ramp.allowedToday).toBeLessThanOrEqual(40);
  });

  it("allows a small follow-up under the new-inbox max", () => {
    const rec = recommendedDailyCap({ stage: "new" });
    const ramp = assertGradualRamp({
      sendsPrior24h: 10,
      projectedTotal: 21,
      projectedAdditional: 1,
      recommended: rec,
    });
    expect(ramp.ok).toBe(true);
  });

  it("computes remaining daily quota", () => {
    expect(remainingDailyQuota(30, 30)).toBe(0);
    expect(remainingDailyQuota(12, 30)).toBe(18);
  });
});


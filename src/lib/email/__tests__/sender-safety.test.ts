import { describe, expect, it } from "vitest";
import { evaluateBounceRate } from "@/lib/email/sender-bounce-rate";
import { assertVolumeWithinCap } from "@/lib/email/sender-volume";

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
    });
  });

  it("blocks projected overflow", () => {
    const r = assertVolumeWithinCap({ sendsLast24h: 48, dailyCap: 50, projectedAdditional: 5 });
    expect(r.ok).toBe(false);
    expect(r.projectedTotal).toBe(53);
    expect(r.overBy).toBe(3);
  });
});

import { describe, expect, it } from "vitest";
import { hourToTrackPct } from "@/components/settings/hours-range-sliders";

/**
 * Native <input type="range"> thumbs sit at (value - min) / (max - min).
 * Highlight + axis use hour / dayScale. These must agree when min=0 and max=dayScale.
 */
function nativeThumbPct(value: number, min: number, max: number): number {
  return ((value - min) / (max - min)) * 100;
}

describe("hourToTrackPct", () => {
  it("maps full-day hours onto 0–100%", () => {
    expect(hourToTrackPct(0)).toBe(0);
    expect(hourToTrackPct(6)).toBe(25);
    expect(hourToTrackPct(9)).toBe(37.5);
    expect(hourToTrackPct(12)).toBe(50);
    expect(hourToTrackPct(17)).toBeCloseTo(70.833, 2);
    expect(hourToTrackPct(18)).toBe(75);
    expect(hourToTrackPct(20)).toBeCloseTo(83.333, 2);
    expect(hourToTrackPct(24)).toBe(100);
  });

  it("aligns with native range thumbs when min=0 and max=24", () => {
    const dayScale = 24;
    for (const hour of [6, 9, 12, 17, 18, 20]) {
      expect(hourToTrackPct(hour, dayScale)).toBeCloseTo(
        nativeThumbPct(hour, 0, dayScale),
        10,
      );
    }
  });

  it("diverges from native thumbs when min/max are the send-window bounds (the bug)", () => {
    // Pre-fix: inputs used min=6 max=20 while highlight used /24 → thumbs drifted.
    expect(hourToTrackPct(9)).not.toBeCloseTo(nativeThumbPct(9, 6, 20), 0);
    expect(hourToTrackPct(17)).not.toBeCloseTo(nativeThumbPct(17, 6, 20), 0);
  });
});

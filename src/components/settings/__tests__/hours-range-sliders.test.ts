import { describe, expect, it } from "vitest";
import { hourToTrackPct } from "@/components/settings/hours-range-sliders";
import { MAX_SEND_HOUR, MIN_SEND_HOUR } from "@/lib/email/send-window";

/**
 * Native <input type="range"> thumbs sit at (value - min) / (max - min).
 * Highlight + axis must use the same min/max (allowed send window).
 */
function nativeThumbPct(value: number, min: number, max: number): number {
  return ((value - min) / (max - min)) * 100;
}

describe("hourToTrackPct", () => {
  it("maps the allowed send window onto 0–100%", () => {
    expect(hourToTrackPct(MIN_SEND_HOUR)).toBe(0);
    expect(hourToTrackPct(9)).toBeCloseTo(((9 - 6) / 14) * 100, 10);
    expect(hourToTrackPct(13)).toBe(50);
    expect(hourToTrackPct(17)).toBeCloseTo(((17 - 6) / 14) * 100, 10);
    expect(hourToTrackPct(MAX_SEND_HOUR)).toBe(100);
  });

  it("aligns with native range thumbs when min/max are the send-window bounds", () => {
    for (const hour of [6, 9, 12, 17, 18, 20]) {
      expect(hourToTrackPct(hour)).toBeCloseTo(
        nativeThumbPct(hour, MIN_SEND_HOUR, MAX_SEND_HOUR),
        10,
      );
    }
  });

  it("does not place allowed hours on a full-day 0–24 track", () => {
    // Old bug: highlight used /24 while thumbs used min=6 max=20 (or the reverse).
    expect(hourToTrackPct(9)).not.toBeCloseTo(nativeThumbPct(9, 0, 24), 0);
    expect(hourToTrackPct(6)).toBe(0);
    expect(hourToTrackPct(20)).toBe(100);
  });
});

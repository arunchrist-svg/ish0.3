import { describe, expect, it } from "vitest";
import { resolveHomeOutreachPeriod, shiftDayKey } from "@/lib/email/home-outreach-period";

const TZ = "Asia/Kolkata";

describe("resolveHomeOutreachPeriod", () => {
  const now = new Date("2026-09-22T10:30:00.000Z");

  it("resolves today as a single calendar day in timezone", () => {
    const p = resolveHomeOutreachPeriod(TZ, { period: "today" }, now);
    expect(p.id).toBe("today");
    expect(p.start).toBeTruthy();
    expect(p.end!.getTime()).toBeGreaterThan(p.start!.getTime());
    expect(p.rangeLabel).toMatch(/22/);
  });

  it("resolves yesterday before today", () => {
    const today = resolveHomeOutreachPeriod(TZ, { period: "today" }, now);
    const yesterday = resolveHomeOutreachPeriod(TZ, { period: "yesterday" }, now);
    expect(yesterday.end!.getTime() - today.start!.getTime()).toBeLessThan(60_000);
  });

  it("resolves this week from Monday through today", () => {
    const p = resolveHomeOutreachPeriod(TZ, { period: "this_week" }, now);
    expect(p.id).toBe("this_week");
    expect(p.start!.getTime()).toBeLessThan(now.getTime());
    expect(p.end!.getTime()).toBeGreaterThan(p.start!.getTime());
  });

  it("resolves last week as seven days before this week", () => {
    const thisWeek = resolveHomeOutreachPeriod(TZ, { period: "this_week" }, now);
    const lastWeek = resolveHomeOutreachPeriod(TZ, { period: "last_week" }, now);
    expect(lastWeek.end!.getTime() - thisWeek.start!.getTime()).toBeLessThan(60_000);
  });

  it("resolves custom inclusive range", () => {
    const p = resolveHomeOutreachPeriod(
      TZ,
      { period: "custom", from: "2026-09-01", to: "2026-09-07" },
      now,
    );
    expect(p.rangeLabel).toMatch(/1 Sep.*7 Sep/);
    const spanMs = p.end!.getTime() - p.start!.getTime();
    expect(spanMs).toBeGreaterThanOrEqual(7 * 24 * 3_600_000 - 60_000);
    expect(spanMs).toBeLessThanOrEqual(7 * 24 * 3_600_000 + 60_000);
  });

  it("all time has no bounds", () => {
    const p = resolveHomeOutreachPeriod(TZ, { period: "all" }, now);
    expect(p.start).toBeNull();
    expect(p.end).toBeNull();
  });
});

describe("shiftDayKey", () => {
  it("steps calendar days", () => {
    expect(shiftDayKey("2026-09-22", -1)).toBe("2026-09-21");
  });
});

import { describe, expect, it } from "vitest";
import { planBatchInitialSends, countPlannedInRolling24h } from "@/lib/outreach/plan-batch-sends";
import { calendarDayKey } from "@/lib/email/send-window-parts";
import { type SendWindow, zonedLocalToUtc } from "@/lib/email/send-window";

const IST = "Asia/Kolkata";
const window: SendWindow = {
  daysOfWeek: [1, 2, 3, 4, 5],
  hourStart: 9,
  hourEnd: 17,
  hourRanges: [{ hourStart: 9, hourEnd: 17 }],
  timezone: IST,
};

describe("planBatchInitialSends", () => {
  it("spaces sends within the send window", () => {
    const now = zonedLocalToUtc({ year: 2026, month: 9, day: 9, hour: 10, minute: 0 }, IST);
    const { slots } = planBatchInitialSends({
      count: 3,
      window,
      dailyCap: 50,
      now,
      existingByDay: new Map(),
      gapMinutes: 3,
    });
    expect(slots).toHaveLength(3);
    expect(slots[1].getTime() - slots[0].getTime()).toBe(3 * 60_000);
    expect(slots[2].getTime() - slots[1].getTime()).toBe(3 * 60_000);
  });

  it("defers to next window when outside hours", () => {
    const now = zonedLocalToUtc({ year: 2026, month: 9, day: 9, hour: 22, minute: 0 }, IST);
    const { slots } = planBatchInitialSends({
      count: 1,
      window,
      dailyCap: 50,
      now,
      existingByDay: new Map(),
    });
    const key = calendarDayKey(slots[0], IST);
    expect(key).toBe("2026-09-10");
  });

  it("spreads overflow across calendar days by daily cap", () => {
    const now = zonedLocalToUtc({ year: 2026, month: 9, day: 9, hour: 10, minute: 0 }, IST);
    const existing = new Map([["2026-09-09", 2]]);
    const { slots, spanDays } = planBatchInitialSends({
      count: 4,
      window,
      dailyCap: 3,
      now,
      existingByDay: existing,
      gapMinutes: 3,
    });
    expect(slots).toHaveLength(4);
    expect(spanDays).toBeGreaterThanOrEqual(2);
    const dayCounts = new Map<string, number>();
    for (const slot of slots) {
      const key = calendarDayKey(slot, IST);
      dayCounts.set(key, (dayCounts.get(key) ?? 0) + 1);
    }
    for (const [, n] of dayCounts) {
      expect(n).toBeLessThanOrEqual(3);
    }
  });

  it("starts on scheduleFrom when set (tomorrow morning)", () => {
    const now = zonedLocalToUtc({ year: 2026, month: 9, day: 11, hour: 22, minute: 0 }, IST);
    const scheduleFrom = zonedLocalToUtc({ year: 2026, month: 9, day: 12, hour: 7, minute: 0 }, IST);
    const weekendWindow: SendWindow = {
      daysOfWeek: [6, 0],
      hourStart: 7,
      hourEnd: 11,
      hourRanges: [{ hourStart: 7, hourEnd: 11 }],
      timezone: IST,
    };
    const { slots } = planBatchInitialSends({
      count: 2,
      window: weekendWindow,
      dailyCap: 50,
      now,
      existingByDay: new Map(),
      scheduleFrom,
    });
    expect(calendarDayKey(slots[0], IST)).toBe("2026-09-12");
    expect(slots[0].getTime()).toBeGreaterThanOrEqual(scheduleFrom.getTime() - 1000);
  });

  it("appends after an existing queue tail", () => {
    const now = zonedLocalToUtc({ year: 2026, month: 9, day: 9, hour: 10, minute: 0 }, IST);
    const queueAfter = zonedLocalToUtc({ year: 2026, month: 9, day: 9, hour: 10, minute: 30 }, IST);
    const { slots } = planBatchInitialSends({
      count: 2,
      window,
      dailyCap: 50,
      now,
      existingByDay: new Map(),
      gapMinutes: 3,
      queueAfter,
    });
    expect(slots[0].getTime()).toBeGreaterThanOrEqual(queueAfter.getTime() + 3 * 60_000 - 1000);
  });
});

describe("countPlannedInRolling24h", () => {
  it("counts slots within the next 24 hours", () => {
    const now = new Date("2026-09-09T10:00:00Z");
    const slots = [
      new Date(now.getTime() + 60_000),
      new Date(now.getTime() + 25 * 60 * 60 * 1000),
    ];
    expect(countPlannedInRolling24h(slots, now)).toBe(1);
  });
});

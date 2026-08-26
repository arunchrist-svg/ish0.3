import { describe, expect, it } from "vitest";
import {
  computeFollowUpScheduledFor,
  isWithinSendWindow,
  nextSendWindowStart,
  normalizeSendDays,
  normalizeSendHourRanges,
  normalizeSendHours,
  normalizeSendTimezone,
  resolveSendWindow,
  snapToSendWindow,
  suggestNextHourRange,
  zonedLocalToUtc,
} from "@/lib/email/send-window";

const IST = "Asia/Kolkata";
const weekdays = [1, 2, 3, 4, 5] as const;

function localParts(date: Date, timeZone: string) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  });
  const map = Object.fromEntries(
    dtf.formatToParts(date).filter((p) => p.type !== "literal").map((p) => [p.type, p.value]),
  );
  return map;
}

describe("send-window normalize", () => {
  it("defaults empty days to Mon–Fri", () => {
    expect(normalizeSendDays([])).toEqual([1, 2, 3, 4, 5]);
    expect(normalizeSendDays(null)).toEqual([1, 2, 3, 4, 5]);
  });

  it("clamps hours so end is after start", () => {
    expect(normalizeSendHours(10, 10)).toEqual({ hourStart: 10, hourEnd: 10.5 });
    expect(normalizeSendHours(9, 17)).toEqual({ hourStart: 9, hourEnd: 17 });
    expect(normalizeSendHours(9.2, 17.4)).toEqual({ hourStart: 9, hourEnd: 17.5 });
  });

  it("clamps hours into the 6:00–20:00 allowed window", () => {
    expect(normalizeSendHours(3, 5)).toEqual({ hourStart: 6, hourEnd: 6.5 });
    expect(normalizeSendHours(5, 22)).toEqual({ hourStart: 6, hourEnd: 20 });
    expect(normalizeSendHours(21, 23)).toEqual({ hourStart: 19.5, hourEnd: 20 });
    expect(normalizeSendHours(0, 24)).toEqual({ hourStart: 6, hourEnd: 20 });
  });

  it("merges overlapping hour ranges and falls back to start/end", () => {
    expect(normalizeSendHourRanges(null, 9, 17)).toEqual([{ hourStart: 9, hourEnd: 17 }]);
    expect(
      normalizeSendHourRanges([
        { hourStart: 8, hourEnd: 14 },
        { hourStart: 16, hourEnd: 20 },
        { hourStart: 13, hourEnd: 15 },
      ]),
    ).toEqual([
      { hourStart: 8, hourEnd: 15 },
      { hourStart: 16, hourEnd: 20 },
    ]);
    expect(suggestNextHourRange([{ hourStart: 8, hourEnd: 14 }])).toEqual({
      hourStart: 15,
      hourEnd: 19,
    });
    expect(suggestNextHourRange([{ hourStart: 6, hourEnd: 20 }])).toBeNull();
  });

  it("falls back invalid timezone to Asia/Kolkata", () => {
    expect(normalizeSendTimezone("Not/AZone")).toBe(IST);
    expect(normalizeSendTimezone(IST)).toBe(IST);
  });
});

describe("zonedLocalToUtc + snap", () => {
  it("round-trips a known IST wall time", () => {
    const utc = zonedLocalToUtc({ year: 2026, month: 8, day: 24, hour: 10, minute: 30 }, IST);
    const parts = localParts(utc, IST);
    expect(parts.hour).toBe("10");
    expect(parts.minute).toBe("30");
    expect(parts.day).toBe("24");
  });

  it("keeps a weekday mid-window candidate", () => {
    // Monday 2026-08-24 10:30 IST
    const candidate = zonedLocalToUtc({ year: 2026, month: 8, day: 24, hour: 10, minute: 30 }, IST);
    const snapped = snapToSendWindow(candidate, {
      daysOfWeek: [...weekdays],
      hourStart: 9,
      hourEnd: 17,
      timezone: IST,
    });
    expect(snapped.getTime()).toBe(candidate.getTime());
  });

  it("rolls weekend to next Monday at window start", () => {
    // Saturday 2026-08-22 11:00 IST
    const candidate = zonedLocalToUtc({ year: 2026, month: 8, day: 22, hour: 11, minute: 0 }, IST);
    const snapped = snapToSendWindow(candidate, {
      daysOfWeek: [...weekdays],
      hourStart: 9,
      hourEnd: 17,
      timezone: IST,
    });
    const parts = localParts(snapped, IST);
    expect(parts.weekday).toBe("Mon");
    expect(parts.day).toBe("24");
    expect(parts.hour).toBe("09");
    expect(parts.minute).toBe("00");
  });

  it("rolls after-hours to next allowed day at window start", () => {
    // Friday 2026-08-21 18:30 IST (after 17:00)
    const candidate = zonedLocalToUtc({ year: 2026, month: 8, day: 21, hour: 18, minute: 30 }, IST);
    const snapped = snapToSendWindow(candidate, {
      daysOfWeek: [...weekdays],
      hourStart: 9,
      hourEnd: 17,
      timezone: IST,
    });
    const parts = localParts(snapped, IST);
    expect(parts.weekday).toBe("Mon");
    expect(parts.day).toBe("24");
    expect(parts.hour).toBe("09");
  });

  it("snaps before-hours up to window start same day", () => {
    // Wednesday 2026-08-26 07:15 IST
    const candidate = zonedLocalToUtc({ year: 2026, month: 8, day: 26, hour: 7, minute: 15 }, IST);
    const snapped = snapToSendWindow(candidate, {
      daysOfWeek: [...weekdays],
      hourStart: 9,
      hourEnd: 17,
      timezone: IST,
    });
    const parts = localParts(snapped, IST);
    expect(parts.day).toBe("26");
    expect(parts.hour).toBe("09");
    expect(parts.minute).toBe("00");
  });
});

describe("isWithinSendWindow + nextSendWindowStart", () => {
  const window = {
    daysOfWeek: [...weekdays],
    hourStart: 9,
    hourEnd: 17,
    timezone: IST,
  };

  it("is true mid-window on an allowed weekday", () => {
    const now = zonedLocalToUtc({ year: 2026, month: 8, day: 24, hour: 10, minute: 30 }, IST);
    expect(isWithinSendWindow(now, window)).toBe(true);
    expect(nextSendWindowStart(now, window).getTime()).toBe(now.getTime());
  });

  it("is false after hours and defers to next weekday window start", () => {
    // Friday 2026-08-21 18:30 IST
    const now = zonedLocalToUtc({ year: 2026, month: 8, day: 21, hour: 18, minute: 30 }, IST);
    expect(isWithinSendWindow(now, window)).toBe(false);
    const next = nextSendWindowStart(now, window);
    expect(next.getTime()).toBeGreaterThan(now.getTime());
    const parts = localParts(next, IST);
    expect(parts.weekday).toBe("Mon");
    expect(parts.day).toBe("24");
    expect(parts.hour).toBe("09");
    expect(parts.minute).toBe("00");
  });

  it("is false before hours and defers to same-day window start", () => {
    const now = zonedLocalToUtc({ year: 2026, month: 8, day: 26, hour: 7, minute: 15 }, IST);
    expect(isWithinSendWindow(now, window)).toBe(false);
    const next = nextSendWindowStart(now, window);
    const parts = localParts(next, IST);
    expect(parts.day).toBe("26");
    expect(parts.hour).toBe("09");
  });

  it("is false on weekend and defers to Monday window start", () => {
    const now = zonedLocalToUtc({ year: 2026, month: 8, day: 22, hour: 11, minute: 0 }, IST);
    expect(isWithinSendWindow(now, window)).toBe(false);
    const next = nextSendWindowStart(now, window);
    const parts = localParts(next, IST);
    expect(parts.weekday).toBe("Mon");
    expect(parts.day).toBe("24");
    expect(parts.hour).toBe("09");
  });
});

describe("computeFollowUpScheduledFor", () => {
  it("applies cadence days then snaps into the window", () => {
    // Email 1: Wednesday 2026-08-19 15:00 IST; +3 days = Saturday 15:00 → Monday 09:00
    const anchor = zonedLocalToUtc({ year: 2026, month: 8, day: 19, hour: 15, minute: 0 }, IST);
    const scheduled = computeFollowUpScheduledFor(anchor, 3, {
      daysOfWeek: [...weekdays],
      hourStart: 9,
      hourEnd: 17,
      timezone: IST,
    });
    const parts = localParts(scheduled, IST);
    expect(parts.weekday).toBe("Mon");
    expect(parts.day).toBe("24");
    expect(parts.hour).toBe("09");
  });

  it("keeps in-window weekday times from the cadence offset", () => {
    // Email 1: Monday 2026-08-17 10:00 IST; +3 days = Thursday 10:00 (in window)
    const anchor = zonedLocalToUtc({ year: 2026, month: 8, day: 17, hour: 10, minute: 0 }, IST);
    const scheduled = computeFollowUpScheduledFor(anchor, 3, resolveSendWindow({ timezone: IST }));
    const parts = localParts(scheduled, IST);
    expect(parts.weekday).toBe("Thu");
    expect(parts.day).toBe("20");
    expect(parts.hour).toBe("10");
  });
});

describe("multi-range hour windows", () => {
  const split = {
    daysOfWeek: [...weekdays],
    hourRanges: [
      { hourStart: 8, hourEnd: 14 },
      { hourStart: 16, hourEnd: 20 },
    ],
    timezone: IST,
  };

  it("is within either block and not the midday gap", () => {
    const morning = zonedLocalToUtc({ year: 2026, month: 8, day: 24, hour: 10, minute: 0 }, IST);
    const gap = zonedLocalToUtc({ year: 2026, month: 8, day: 24, hour: 15, minute: 0 }, IST);
    const evening = zonedLocalToUtc({ year: 2026, month: 8, day: 24, hour: 17, minute: 0 }, IST);
    expect(isWithinSendWindow(morning, split)).toBe(true);
    expect(isWithinSendWindow(gap, split)).toBe(false);
    expect(isWithinSendWindow(evening, split)).toBe(true);
  });

  it("snaps gap times forward to the next block same day", () => {
    const gap = zonedLocalToUtc({ year: 2026, month: 8, day: 24, hour: 15, minute: 0 }, IST);
    const snapped = snapToSendWindow(gap, split);
    const parts = localParts(snapped, IST);
    expect(parts.day).toBe("24");
    expect(parts.hour).toBe("16");
    expect(parts.minute).toBe("00");
  });

  it("snaps after the last block to the next weekday first block", () => {
    const late = zonedLocalToUtc({ year: 2026, month: 8, day: 24, hour: 21, minute: 0 }, IST);
    const snapped = snapToSendWindow(late, split);
    const parts = localParts(snapped, IST);
    expect(parts.weekday).toBe("Tue");
    expect(parts.day).toBe("25");
    expect(parts.hour).toBe("08");
  });

  it("supports half-hour range bounds", () => {
    const window = {
      daysOfWeek: [...weekdays],
      hourRanges: [{ hourStart: 9.5, hourEnd: 17.5 }],
      timezone: IST,
    };
    const before = zonedLocalToUtc({ year: 2026, month: 8, day: 24, hour: 9, minute: 15 }, IST);
    const inside = zonedLocalToUtc({ year: 2026, month: 8, day: 24, hour: 9, minute: 45 }, IST);
    expect(isWithinSendWindow(before, window)).toBe(false);
    expect(isWithinSendWindow(inside, window)).toBe(true);
    const snapped = snapToSendWindow(before, window);
    const parts = localParts(snapped, IST);
    expect(parts.hour).toBe("09");
    expect(parts.minute).toBe("30");
  });
});

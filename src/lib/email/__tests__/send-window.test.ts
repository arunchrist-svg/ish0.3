import { describe, expect, it } from "vitest";
import {
  computeFollowUpScheduledFor,
  isWithinSendWindow,
  nextSendWindowStart,
  normalizeSendDays,
  normalizeSendHours,
  normalizeSendTimezone,
  resolveSendWindow,
  snapToSendWindow,
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
    expect(normalizeSendHours(10, 10)).toEqual({ hourStart: 10, hourEnd: 11 });
    expect(normalizeSendHours(9, 17)).toEqual({ hourStart: 9, hourEnd: 17 });
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

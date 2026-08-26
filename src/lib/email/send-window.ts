/** Days and local hours (6:00–20:00 exclusive end) when follow-up outreach may be scheduled. */

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type SendHourRange = {
  /** Inclusive local start hour (6–19.5), snapped to 30-minute steps. */
  hourStart: number;
  /** Exclusive local end hour (6.5–20), snapped to 30-minute steps. e.g. 8–14 = 08:00 up to but not including 14:00. */
  hourEnd: number;
};

/** Snap a decimal hour to the nearest half-hour (e.g. 9.2 → 9, 9.4 → 9.5). */
export function snapToHalfHour(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 2) / 2;
}

export type SendWindow = {
  /** Allowed weekdays (0 = Sunday … 6 = Saturday). */
  daysOfWeek: Weekday[];
  /**
   * Inclusive local start of the earliest range (6–19.5, half-hour steps).
   * Kept for backward compatibility; prefer `hourRanges`.
   */
  hourStart: number;
  /**
   * Exclusive local end of the latest range (6.5–20, half-hour steps).
   * Kept for backward compatibility; prefer `hourRanges`.
   */
  hourEnd: number;
  /** One or more non-overlapping local hour blocks. Source of truth for send windows. */
  hourRanges: SendHourRange[];
  /** IANA timezone used when snapping scheduled sends into the window. */
  timezone: string;
};

export const DEFAULT_SEND_DAYS: Weekday[] = [1, 2, 3, 4, 5];
export const DEFAULT_SEND_HOUR_START = 9;
export const DEFAULT_SEND_HOUR_END = 17;
export const DEFAULT_SEND_TIMEZONE = "Asia/Kolkata";
export const MAX_SEND_HOUR_RANGES = 4;
/** Inclusive earliest allowed local hour (6:00 AM). */
export const MIN_SEND_HOUR = 6;
/** Exclusive latest allowed local hour (8:00 PM). No sends at or after this. */
export const MAX_SEND_HOUR = 20;

export const WEEKDAY_OPTIONS: { value: Weekday; label: string; short: string }[] = [
  { value: 1, label: "Monday", short: "Mon" },
  { value: 2, label: "Tuesday", short: "Tue" },
  { value: 3, label: "Wednesday", short: "Wed" },
  { value: 4, label: "Thursday", short: "Thu" },
  { value: 5, label: "Friday", short: "Fri" },
  { value: 6, label: "Saturday", short: "Sat" },
  { value: 0, label: "Sunday", short: "Sun" },
];

export const SEND_TIMEZONE_OPTIONS: { value: string; label: string }[] = [
  { value: "Asia/Kolkata", label: "India (IST)" },
  { value: "Asia/Dubai", label: "Dubai (GST)" },
  { value: "Asia/Singapore", label: "Singapore" },
  { value: "Europe/London", label: "London" },
  { value: "America/New_York", label: "New York" },
  { value: "America/Los_Angeles", label: "Los Angeles" },
  { value: "UTC", label: "UTC" },
];

export const SEND_WINDOW_PRESETS: {
  id: string;
  label: string;
  hourStart: number;
  hourEnd: number;
}[] = [
  { id: "business", label: "9–5", hourStart: 9, hourEnd: 17 },
  { id: "morning", label: "9–12", hourStart: 9, hourEnd: 12 },
  { id: "afternoon", label: "12–17", hourStart: 12, hourEnd: 17 },
  { id: "extended", label: "8–18", hourStart: 8, hourEnd: 18 },
];

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: Weekday;
};

function isValidTimeZone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function normalizeSendDays(input?: number[] | null): Weekday[] {
  if (!input || input.length === 0) return [...DEFAULT_SEND_DAYS];
  const unique = [
    ...new Set(
      input
        .map((d) => Math.round(d))
        .filter((d): d is Weekday => d >= 0 && d <= 6),
    ),
  ].sort((a, b) => a - b);
  return unique.length > 0 ? unique : [...DEFAULT_SEND_DAYS];
}

export function normalizeSendHours(
  hourStart?: number | null,
  hourEnd?: number | null,
): SendHourRange {
  let start = Number.isFinite(hourStart)
    ? snapToHalfHour(hourStart as number)
    : DEFAULT_SEND_HOUR_START;
  let end = Number.isFinite(hourEnd) ? snapToHalfHour(hourEnd as number) : DEFAULT_SEND_HOUR_END;
  // Allowed window: 6:00 inclusive through 20:00 exclusive (half-hour steps).
  start = Math.max(MIN_SEND_HOUR, Math.min(MAX_SEND_HOUR - 0.5, start));
  end = Math.max(start + 0.5, Math.min(MAX_SEND_HOUR, end));
  return { hourStart: start, hourEnd: end };
}

/** Normalize, sort, and merge overlapping hour ranges. Caps at MAX_SEND_HOUR_RANGES. */
export function normalizeSendHourRanges(
  ranges?: SendHourRange[] | null,
  fallbackStart?: number | null,
  fallbackEnd?: number | null,
): SendHourRange[] {
  const source =
    ranges && ranges.length > 0
      ? ranges
      : [normalizeSendHours(fallbackStart, fallbackEnd)];

  const normalized = source
    .map((r) => normalizeSendHours(r?.hourStart, r?.hourEnd))
    .sort((a, b) => a.hourStart - b.hourStart || a.hourEnd - b.hourEnd);

  const merged: SendHourRange[] = [];
  for (const range of normalized) {
    const last = merged[merged.length - 1];
    if (!last) {
      merged.push({ ...range });
      continue;
    }
    // Touching or overlapping ranges coalesce into one block.
    if (range.hourStart <= last.hourEnd) {
      last.hourEnd = Math.max(last.hourEnd, range.hourEnd);
      continue;
    }
    merged.push({ ...range });
  }

  return merged.slice(0, MAX_SEND_HOUR_RANGES);
}

export function normalizeSendTimezone(input?: string | null): string {
  const tz = (input ?? "").trim();
  if (tz && isValidTimeZone(tz)) return tz;
  return DEFAULT_SEND_TIMEZONE;
}

export function resolveSendWindow(input?: Partial<SendWindow> | null): SendWindow {
  const hourRanges = normalizeSendHourRanges(
    input?.hourRanges,
    input?.hourStart,
    input?.hourEnd,
  );
  return {
    daysOfWeek: normalizeSendDays(input?.daysOfWeek),
    hourStart: hourRanges[0]!.hourStart,
    hourEnd: hourRanges[hourRanges.length - 1]!.hourEnd,
    hourRanges,
    timezone: normalizeSendTimezone(input?.timezone),
  };
}

/**
 * Build a send window from email settings fields (single range or multi-range).
 */
export function sendWindowFromEmailFields(fields: {
  sendDaysOfWeek?: number[] | null;
  sendHourStart?: number | null;
  sendHourEnd?: number | null;
  sendHourRanges?: SendHourRange[] | null;
  sendTimezone?: string | null;
}): SendWindow {
  return resolveSendWindow({
    daysOfWeek: fields.sendDaysOfWeek as Weekday[] | undefined,
    hourStart: fields.sendHourStart ?? undefined,
    hourEnd: fields.sendHourEnd ?? undefined,
    hourRanges: fields.sendHourRanges ?? undefined,
    timezone: fields.sendTimezone ?? undefined,
  });
}

/** Suggest a non-overlapping block to append, or null when the allowed 6–20 band is full. */
export function suggestNextHourRange(ranges: SendHourRange[]): SendHourRange | null {
  const current = normalizeSendHourRanges(ranges);
  if (current.length >= MAX_SEND_HOUR_RANGES) return null;

  const last = current[current.length - 1];
  if (last) {
    // Leave a 1-hour gap so the new block stays separate (e.g. 8–14 then 15–19).
    const start = last.hourEnd + 1;
    if (start < MAX_SEND_HOUR) {
      const end = Math.min(MAX_SEND_HOUR, start + 4);
      if (end > start) return { hourStart: start, hourEnd: end };
    }
  }

  let cursor = MIN_SEND_HOUR;
  for (const range of current) {
    if (range.hourStart - cursor >= 2) {
      const start = cursor;
      const end = Math.min(range.hourStart - 1, start + 4);
      if (end > start) return { hourStart: start, hourEnd: end };
    }
    cursor = Math.max(cursor, range.hourEnd);
  }
  return null;
}

function getZonedParts(date: Date, timeZone: string): ZonedParts {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  });
  const map = Object.fromEntries(
    dtf.formatToParts(date).filter((p) => p.type !== "literal").map((p) => [p.type, p.value]),
  ) as Record<string, string>;

  const weekdayMap: Record<string, Weekday> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
    weekday: weekdayMap[map.weekday] ?? 0,
  };
}

/** Convert a wall-clock time in `timeZone` to a UTC Date. */
export function zonedLocalToUtc(
  parts: { year: number; month: number; day: number; hour: number; minute?: number; second?: number },
  timeZone: string,
): Date {
  const minute = parts.minute ?? 0;
  const second = parts.second ?? 0;
  const utcGuess = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, minute, second);

  const offsetMs = (instant: Date) => {
    const p = getZonedParts(instant, timeZone);
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    return asUtc - instant.getTime();
  };

  // Two passes handle DST transitions where the offset depends on the instant.
  let date = new Date(utcGuess - offsetMs(new Date(utcGuess)));
  date = new Date(utcGuess - offsetMs(date));
  return date;
}

function addCalendarDays(
  parts: { year: number; month: number; day: number },
  days: number,
): { year: number; month: number; day: number; weekday: Weekday } {
  const utc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days, 12, 0, 0));
  return {
    year: utc.getUTCFullYear(),
    month: utc.getUTCMonth() + 1,
    day: utc.getUTCDate(),
    weekday: utc.getUTCDay() as Weekday,
  };
}

function atLocalHour(
  dateParts: { year: number; month: number; day: number },
  hour: number,
  timezone: string,
): Date {
  const snapped = snapToHalfHour(hour);
  const wholeHour = Math.floor(snapped);
  const minute = Math.round((snapped - wholeHour) * 60);
  return zonedLocalToUtc(
    {
      year: dateParts.year,
      month: dateParts.month,
      day: dateParts.day,
      hour: wholeHour,
      minute,
      second: 0,
    },
    timezone,
  );
}

function firstRangeStart(window: SendWindow): number {
  return window.hourRanges[0]?.hourStart ?? window.hourStart;
}

/**
 * True when `now` is an allowed weekday and falls in any hour range in the window timezone.
 */
export function isWithinSendWindow(now: Date, windowInput?: Partial<SendWindow> | null): boolean {
  const window = resolveSendWindow(windowInput);
  const parts = getZonedParts(now, window.timezone);
  if (!window.daysOfWeek.includes(parts.weekday)) return false;
  const minutes = parts.hour * 60 + parts.minute;
  return window.hourRanges.some(
    (range) => minutes >= range.hourStart * 60 && minutes < range.hourEnd * 60,
  );
}

/**
 * Snap a candidate instant into the allowed send window in `window.timezone`.
 * If the day or local time is outside the window, rolls forward to the next valid slot
 * (next allowed day at the first range start, same-day next range start when in a gap,
 * or same-day first range start when still before the window).
 */
export function snapToSendWindow(candidate: Date, windowInput?: Partial<SendWindow> | null): Date {
  const window = resolveSendWindow(windowInput);
  const allowed = new Set(window.daysOfWeek);
  const openHour = firstRangeStart(window);

  let current = candidate;
  let parts = getZonedParts(current, window.timezone);
  let guard = 0;

  while (guard++ < 14) {
    if (!allowed.has(parts.weekday)) {
      const next = addCalendarDays(parts, 1);
      current = atLocalHour(next, openHour, window.timezone);
      parts = getZonedParts(current, window.timezone);
      continue;
    }

    const minutes = parts.hour * 60 + parts.minute;
    let snapped: Date | null = null;

    for (const range of window.hourRanges) {
      const startMinutes = range.hourStart * 60;
      const endMinutes = range.hourEnd * 60;
      if (minutes < startMinutes) {
        snapped = atLocalHour(parts, range.hourStart, window.timezone);
        break;
      }
      if (minutes < endMinutes) {
        return current;
      }
    }

    if (snapped) return snapped;

    const next = addCalendarDays(parts, 1);
    current = atLocalHour(next, openHour, window.timezone);
    parts = getZonedParts(current, window.timezone);
  }

  return atLocalHour(getZonedParts(candidate, window.timezone), openHour, window.timezone);
}

/**
 * Earliest allowed send instant at or after `now` (same snap rules as scheduling).
 * When already inside the window, returns `now` unchanged.
 */
export function nextSendWindowStart(now: Date, windowInput?: Partial<SendWindow> | null): Date {
  return snapToSendWindow(now, windowInput);
}

/**
 * Schedule a follow-up `daysAfter` calendar days after `anchor`, then snap into the send window.
 * Rolling forward never sends earlier than the cadence offset, and never outside days/hours.
 */
export function computeFollowUpScheduledFor(
  anchor: Date,
  daysAfter: number,
  windowInput?: Partial<SendWindow> | null,
): Date {
  const day = Math.max(1, Math.round(daysAfter));
  const candidate = new Date(anchor.getTime() + day * 24 * 60 * 60 * 1000);
  return snapToSendWindow(candidate, windowInput);
}

/** True when both instants fall on the same calendar date in `timezone`. */
export function sameCalendarDay(a: Date, b: Date, timezone: string): boolean {
  const tz = normalizeSendTimezone(timezone);
  const pa = getZonedParts(a, tz);
  const pb = getZonedParts(b, tz);
  return pa.year === pb.year && pa.month === pb.month && pa.day === pb.day;
}

function formatClockPart(hour: number): { h12: number; minutes: string; suffix: "AM" | "PM" } {
  const snapped = snapToHalfHour(hour);
  if (snapped === 24 || snapped === 0) {
    return { h12: 12, minutes: "00", suffix: "AM" };
  }
  const whole = Math.floor(snapped);
  const minutes = snapped % 1 === 0.5 ? "30" : "00";
  const suffix: "AM" | "PM" = whole >= 12 ? "PM" : "AM";
  const h12 = whole % 12 === 0 ? 12 : whole % 12;
  return { h12, minutes, suffix };
}

export function formatHourLabel(hour: number): string {
  const { h12, minutes, suffix } = formatClockPart(hour);
  return `${h12}:${minutes} ${suffix}`;
}

/** Compact label for axis ticks (e.g. 12a, 4a, 12p). */
export function formatHourAxisLabel(hour: number): string {
  const { h12, suffix } = formatClockPart(hour);
  return `${h12}${suffix === "AM" ? "a" : "p"}`;
}

export function formatHourRangeShort(range: SendHourRange): string {
  const fmt = (h: number) => (h % 1 === 0 ? String(h) : h.toFixed(1));
  return `${fmt(range.hourStart)}–${fmt(range.hourEnd)}`;
}

export function sendWindowSummary(windowInput?: Partial<SendWindow> | null): string {
  const window = resolveSendWindow(windowInput);
  const days = WEEKDAY_OPTIONS.filter((d) => window.daysOfWeek.includes(d.value))
    .map((d) => d.short)
    .join(", ");
  const tz =
    SEND_TIMEZONE_OPTIONS.find((o) => o.value === window.timezone)?.label ?? window.timezone;
  const hours = window.hourRanges
    .map((r) => `${formatHourLabel(r.hourStart)}–${formatHourLabel(r.hourEnd)}`)
    .join(" & ");
  return `${days}, ${hours} (${tz})`;
}

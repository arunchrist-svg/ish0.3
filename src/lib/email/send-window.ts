/** Days and local hours when follow-up outreach may be scheduled. */

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type SendWindow = {
  /** Allowed weekdays (0 = Sunday … 6 = Saturday). */
  daysOfWeek: Weekday[];
  /** Inclusive local start hour (0–23). */
  hourStart: number;
  /** Exclusive local end hour (1–24). e.g. 9–17 = 09:00 up to but not including 17:00. */
  hourEnd: number;
  /** IANA timezone used when snapping scheduled sends into the window. */
  timezone: string;
};

export const DEFAULT_SEND_DAYS: Weekday[] = [1, 2, 3, 4, 5];
export const DEFAULT_SEND_HOUR_START = 9;
export const DEFAULT_SEND_HOUR_END = 17;
export const DEFAULT_SEND_TIMEZONE = "Asia/Kolkata";

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
): { hourStart: number; hourEnd: number } {
  let start = Number.isFinite(hourStart) ? Math.round(hourStart as number) : DEFAULT_SEND_HOUR_START;
  let end = Number.isFinite(hourEnd) ? Math.round(hourEnd as number) : DEFAULT_SEND_HOUR_END;
  start = Math.max(0, Math.min(22, start));
  end = Math.max(start + 1, Math.min(24, end));
  return { hourStart: start, hourEnd: end };
}

export function normalizeSendTimezone(input?: string | null): string {
  const tz = (input ?? "").trim();
  if (tz && isValidTimeZone(tz)) return tz;
  return DEFAULT_SEND_TIMEZONE;
}

export function resolveSendWindow(input?: Partial<SendWindow> | null): SendWindow {
  const { hourStart, hourEnd } = normalizeSendHours(input?.hourStart, input?.hourEnd);
  return {
    daysOfWeek: normalizeSendDays(input?.daysOfWeek),
    hourStart,
    hourEnd,
    timezone: normalizeSendTimezone(input?.timezone),
  };
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

function atWindowStart(
  dateParts: { year: number; month: number; day: number },
  window: SendWindow,
): Date {
  return zonedLocalToUtc(
    { year: dateParts.year, month: dateParts.month, day: dateParts.day, hour: window.hourStart, minute: 0, second: 0 },
    window.timezone,
  );
}

/**
 * True when `now` is an allowed weekday and falls in `[hourStart, hourEnd)` in the window timezone.
 */
export function isWithinSendWindow(now: Date, windowInput?: Partial<SendWindow> | null): boolean {
  const window = resolveSendWindow(windowInput);
  const parts = getZonedParts(now, window.timezone);
  if (!window.daysOfWeek.includes(parts.weekday)) return false;
  const minutes = parts.hour * 60 + parts.minute;
  return minutes >= window.hourStart * 60 && minutes < window.hourEnd * 60;
}

/**
 * Snap a candidate instant into the allowed send window in `window.timezone`.
 * If the day or local time is outside the window, rolls forward to the next valid slot
 * (next allowed day at hourStart, or same day at hourStart when still before the window).
 */
export function snapToSendWindow(candidate: Date, windowInput?: Partial<SendWindow> | null): Date {
  const window = resolveSendWindow(windowInput);
  const allowed = new Set(window.daysOfWeek);

  let current = candidate;
  let parts = getZonedParts(current, window.timezone);
  let guard = 0;

  while (guard++ < 14) {
    if (!allowed.has(parts.weekday)) {
      const next = addCalendarDays(parts, 1);
      current = atWindowStart(next, window);
      parts = getZonedParts(current, window.timezone);
      continue;
    }

    const minutes = parts.hour * 60 + parts.minute;
    const startMinutes = window.hourStart * 60;
    const endMinutes = window.hourEnd * 60;

    if (minutes < startMinutes) {
      current = atWindowStart(parts, window);
      return current;
    }
    if (minutes >= endMinutes) {
      const next = addCalendarDays(parts, 1);
      current = atWindowStart(next, window);
      parts = getZonedParts(current, window.timezone);
      continue;
    }

    return current;
  }

  return atWindowStart(getZonedParts(candidate, window.timezone), window);
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

export function formatHourLabel(hour: number): string {
  if (hour === 0) return "12:00 AM";
  if (hour === 12) return "12:00 PM";
  if (hour === 24) return "12:00 AM";
  if (hour < 12) return `${hour}:00 AM`;
  return `${hour - 12}:00 PM`;
}

export function sendWindowSummary(windowInput?: Partial<SendWindow> | null): string {
  const window = resolveSendWindow(windowInput);
  const days = WEEKDAY_OPTIONS.filter((d) => window.daysOfWeek.includes(d.value))
    .map((d) => d.short)
    .join(", ");
  const tz =
    SEND_TIMEZONE_OPTIONS.find((o) => o.value === window.timezone)?.label ?? window.timezone;
  return `${days}, ${formatHourLabel(window.hourStart)}–${formatHourLabel(window.hourEnd)} (${tz})`;
}

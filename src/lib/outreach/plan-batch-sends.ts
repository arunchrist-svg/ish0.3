import {
  type SendHourRange,
  type SendWindow,
  isWithinSendWindow,
  snapToSendWindow,
  zonedLocalToUtc,
} from "@/lib/email/send-window";
import { calendarDayKey, getZonedParts, type ZonedParts } from "@/lib/email/send-window-parts";

/** Smallest gap between batch Email 1 sends. */
export const BATCH_SEND_GAP_MIN_SECONDS = 30;
/** Largest gap between batch Email 1 sends. */
export const BATCH_SEND_GAP_MAX_SECONDS = 180;
/** @deprecated Use BATCH_SEND_GAP_MAX_SECONDS. Kept as the old equal-gap default. */
export const BATCH_SEND_GAP_MINUTES = BATCH_SEND_GAP_MAX_SECONDS / 60;

const MAX_PLAN_ITERATIONS = 2000;

export function randomBatchSendGapMs(random: () => number = Math.random): number {
  const span = BATCH_SEND_GAP_MAX_SECONDS - BATCH_SEND_GAP_MIN_SECONDS;
  const unit = Math.min(1, Math.max(0, random()));
  const seconds = BATCH_SEND_GAP_MIN_SECONDS + Math.min(span, Math.floor(unit * (span + 1)));
  return seconds * 1000;
}

function firstRangeStart(window: SendWindow): number {
  return window.hourRanges[0]?.hourStart ?? window.hourStart;
}

function addCalendarDays(
  parts: { year: number; month: number; day: number },
  days: number,
): ZonedParts {
  const utc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days, 12, 0, 0));
  return {
    year: utc.getUTCFullYear(),
    month: utc.getUTCMonth() + 1,
    day: utc.getUTCDate(),
    hour: 12,
    minute: 0,
    second: 0,
    weekday: utc.getUTCDay() as ZonedParts["weekday"],
  };
}

function atLocalHour(
  dateParts: { year: number; month: number; day: number },
  hour: number,
  timezone: string,
): Date {
  const wholeHour = Math.floor(hour);
  const minute = hour % 1 === 0.5 ? 30 : 0;
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

function nextAllowedDayStart(after: Date, window: SendWindow): Date {
  let parts = getZonedParts(after, window.timezone);
  for (let hop = 0; hop < 14; hop++) {
    parts = addCalendarDays(parts, 1);
    if (window.daysOfWeek.includes(parts.weekday)) {
      return atLocalHour(parts, firstRangeStart(window), window.timezone);
    }
  }
  return snapToSendWindow(new Date(after.getTime() + 24 * 60 * 60 * 1000), window);
}

function dayIsFull(dayKey: string, dayCount: Map<string, number>, dailyCap: number): boolean {
  return (dayCount.get(dayKey) ?? 0) >= dailyCap;
}

function rangeDurationHours(range: SendHourRange): number {
  return Math.max(0.5, range.hourEnd - range.hourStart);
}

/** Split the daily cap across hour ranges by duration (morning/evening get a fair share). */
export function allocateDailyCapAcrossRanges(ranges: SendHourRange[], dailyCap: number): number[] {
  if (ranges.length === 0) return [];
  if (ranges.length === 1) return [Math.max(0, dailyCap)];

  const durations = ranges.map(rangeDurationHours);
  const total = durations.reduce((sum, d) => sum + d, 0);
  const caps = durations.map((d) => Math.floor((dailyCap * d) / total));
  let remainder = dailyCap - caps.reduce((sum, n) => sum + n, 0);
  for (let i = caps.length - 1; i >= 0 && remainder > 0; i--) {
    caps[i]! += 1;
    remainder -= 1;
  }
  return caps;
}

function rangeIndexAt(candidate: Date, window: SendWindow): number {
  const parts = getZonedParts(candidate, window.timezone);
  const minutes = parts.hour * 60 + parts.minute;
  return window.hourRanges.findIndex((range) => {
    const start = range.hourStart * 60;
    const end = range.hourEnd * 60;
    return minutes >= start && minutes < end;
  });
}

function rangeCountKey(dayKey: string, rangeIndex: number): string {
  return `${dayKey}:${rangeIndex}`;
}

/** Assume prior sends filled earlier ranges first so evening still gets its share. */
function seedRangeCounts(
  existingByDay: Map<string, number>,
  rangeCaps: number[],
): Map<string, number> {
  const out = new Map<string, number>();
  for (const [dayKey, existing] of existingByDay) {
    let left = Math.max(0, existing);
    for (let i = 0; i < rangeCaps.length; i++) {
      const use = Math.min(left, rangeCaps[i]!);
      out.set(rangeCountKey(dayKey, i), use);
      left -= use;
    }
  }
  return out;
}

function advancePastRange(candidate: Date, window: SendWindow, rangeIndex: number): Date {
  const parts = getZonedParts(candidate, window.timezone);
  const next = window.hourRanges[rangeIndex + 1];
  if (next) {
    return atLocalHour(parts, next.hourStart, window.timezone);
  }
  return nextAllowedDayStart(candidate, window);
}

export type BatchSendPlan = {
  slots: Date[];
  /** Calendar days spanned in the settings timezone (inclusive). */
  spanDays: number;
};

/**
 * Plan Email 1 send times for a batch: respects send window (timezone, days, hours)
 * and daily send cap per calendar day in that timezone.
 * With morning + evening ranges, the daily cap is split across those blocks.
 * Default spacing is a fresh random gap of 30s–3m between each send.
 */
export function planBatchInitialSends(params: {
  count: number;
  window: SendWindow;
  dailyCap: number;
  now: Date;
  /** Existing sent + scheduled Email 1 counts keyed by YYYY-MM-DD in window timezone. */
  existingByDay: Map<string, number>;
  /** Fixed gap in minutes. When omitted, each send uses a random 30s–3m gap. */
  gapMinutes?: number;
  /** Injected RNG for tests (0..1). Ignored when gapMinutes is set. */
  random?: () => number;
  /** Append after this instant (existing queue tail + one gap). */
  queueAfter?: Date | null;
  /** First slot anchor (e.g. tomorrow 7:00 local). Snapped to the send window. */
  scheduleFrom?: Date | null;
}): BatchSendPlan {
  const nextGapMs =
    params.gapMinutes != null
      ? () => params.gapMinutes! * 60_000
      : () => randomBatchSendGapMs(params.random ?? Math.random);
  const dayCount = new Map(params.existingByDay);
  const rangeCaps = allocateDailyCapAcrossRanges(params.window.hourRanges, params.dailyCap);
  const rangeCounts = seedRangeCounts(params.existingByDay, rangeCaps);
  const splitByRange = params.window.hourRanges.length > 1;
  const slots: Date[] = [];
  let lastSlot: Date | null = null;
  const queueStart = params.queueAfter
    ? new Date(params.queueAfter.getTime() + nextGapMs())
    : null;

  for (let i = 0; i < params.count; i++) {
    const stepGapMs = lastSlot ? nextGapMs() : 0;
    let candidate: Date = lastSlot
      ? new Date(Math.max(params.now.getTime(), lastSlot.getTime() + stepGapMs))
      : queueStart
        ? new Date(Math.max(params.now.getTime(), queueStart.getTime()))
        : params.scheduleFrom
          ? new Date(params.scheduleFrom.getTime())
          : new Date(params.now);

    let guard = 0;
    while (guard++ < MAX_PLAN_ITERATIONS) {
      if (!isWithinSendWindow(candidate, params.window)) {
        candidate = snapToSendWindow(candidate, params.window);
      }

      const dayKey = calendarDayKey(candidate, params.window.timezone);
      if (dayIsFull(dayKey, dayCount, params.dailyCap)) {
        candidate = nextAllowedDayStart(candidate, params.window);
        continue;
      }

      const rangeIndex = rangeIndexAt(candidate, params.window);
      if (splitByRange && rangeIndex >= 0) {
        const key = rangeCountKey(dayKey, rangeIndex);
        const used = rangeCounts.get(key) ?? 0;
        if (used >= rangeCaps[rangeIndex]!) {
          candidate = advancePastRange(candidate, params.window, rangeIndex);
          continue;
        }
      }

      if (lastSlot && candidate.getTime() < lastSlot.getTime() + stepGapMs) {
        candidate = new Date(lastSlot.getTime() + stepGapMs);
        if (!isWithinSendWindow(candidate, params.window)) {
          candidate = snapToSendWindow(candidate, params.window);
        }
        continue;
      }

      slots.push(candidate);
      dayCount.set(dayKey, (dayCount.get(dayKey) ?? 0) + 1);
      if (splitByRange && rangeIndex >= 0) {
        const key = rangeCountKey(dayKey, rangeIndex);
        rangeCounts.set(key, (rangeCounts.get(key) ?? 0) + 1);
      }
      lastSlot = candidate;
      break;
    }

    if (slots.length <= i) {
      throw new Error("Could not plan batch sends within allowed days and daily cap");
    }
  }

  const dayKeys = new Set(slots.map((s) => calendarDayKey(s, params.window.timezone)));
  return { slots, spanDays: dayKeys.size };
}

/** How many planned slots fall within the rolling next 24 hours (for sender preflight). */
export function countPlannedInRolling24h(slots: Date[], now: Date): number {
  const end = now.getTime() + 24 * 60 * 60 * 1000;
  return slots.filter((s) => s.getTime() <= end).length;
}

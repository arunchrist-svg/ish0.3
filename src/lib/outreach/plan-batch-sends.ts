import {
  type SendWindow,
  isWithinSendWindow,
  snapToSendWindow,
  zonedLocalToUtc,
} from "@/lib/email/send-window";
import { calendarDayKey, getZonedParts, type ZonedParts } from "@/lib/email/send-window-parts";

/** Average spacing between batch sends (matches board 1–5 minute range). */
export const BATCH_SEND_GAP_MINUTES = 3;

const MAX_PLAN_ITERATIONS = 2000;

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

export type BatchSendPlan = {
  slots: Date[];
  /** Calendar days spanned in the settings timezone (inclusive). */
  spanDays: number;
};

/**
 * Plan Email 1 send times for a batch: respects send window (timezone, days, hours)
 * and daily send cap per calendar day in that timezone. Spaces sends by gapMinutes.
 */
export function planBatchInitialSends(params: {
  count: number;
  window: SendWindow;
  dailyCap: number;
  now: Date;
  /** Existing sent + scheduled Email 1 counts keyed by YYYY-MM-DD in window timezone. */
  existingByDay: Map<string, number>;
  gapMinutes?: number;
  /** Append after this instant (existing queue tail + gap). */
  queueAfter?: Date | null;
}): BatchSendPlan {
  const gapMs = (params.gapMinutes ?? BATCH_SEND_GAP_MINUTES) * 60_000;
  const dayCount = new Map(params.existingByDay);
  const slots: Date[] = [];
  let lastSlot: Date | null = null;
  const queueStart = params.queueAfter
    ? new Date(params.queueAfter.getTime() + gapMs)
    : null;

  for (let i = 0; i < params.count; i++) {
    let candidate: Date = lastSlot
      ? new Date(Math.max(params.now.getTime(), lastSlot.getTime() + gapMs))
      : queueStart
        ? new Date(Math.max(params.now.getTime(), queueStart.getTime()))
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

      if (lastSlot && candidate.getTime() < lastSlot.getTime() + gapMs) {
        candidate = new Date(lastSlot.getTime() + gapMs);
        if (!isWithinSendWindow(candidate, params.window)) {
          candidate = snapToSendWindow(candidate, params.window);
        }
        continue;
      }

      slots.push(candidate);
      dayCount.set(dayKey, (dayCount.get(dayKey) ?? 0) + 1);
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

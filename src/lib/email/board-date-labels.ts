/** Short date/time labels for leads board + Outbox cards (daily-cap day + sent time). */

import { calendarDayKey, getZonedParts } from "@/lib/email/send-window-parts";
import { DEFAULT_SEND_TIMEZONE } from "@/lib/email/send-window";

function nextCalendarDayKey(ymd: string): string {
  const [year, month, day] = ymd.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day + 1));
  return `${utc.getUTCFullYear()}-${String(utc.getUTCMonth() + 1).padStart(2, "0")}-${String(utc.getUTCDate()).padStart(2, "0")}`;
}

export function boardDayRelative(
  iso: string,
  now = new Date(),
  timeZone: string = DEFAULT_SEND_TIMEZONE,
): "today" | "tomorrow" | null {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  const due = calendarDayKey(at, timeZone);
  const today = calendarDayKey(now, timeZone);
  if (due === today) return "today";
  if (due === nextCalendarDayKey(today)) return "tomorrow";
  return null;
}

export function formatBoardDate(
  iso: string,
  now = new Date(),
  timeZone: string = DEFAULT_SEND_TIMEZONE,
): string | null {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  const relative = boardDayRelative(iso, now, timeZone);
  if (relative) return relative;
  const dueParts = getZonedParts(at, timeZone);
  const nowParts = getZonedParts(now, timeZone);
  return at.toLocaleDateString("en-IN", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(dueParts.year === nowParts.year ? {} : { year: "numeric" }),
  });
}

export function formatBoardDateTime(
  iso: string,
  now = new Date(),
  timeZone: string = DEFAULT_SEND_TIMEZONE,
): string | null {
  const datePart = formatBoardDate(iso, now, timeZone);
  if (!datePart) return null;
  const at = new Date(iso);
  const timePart = at.toLocaleTimeString("en-IN", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  });
  return `${datePart}, ${timePart}`;
}

/**
 * Day that counts toward the daily Email 1 send cap:
 * sent_at when Email 1 is sent, otherwise scheduled_for while queued.
 */
export function countedForIso(opts: {
  lastEmailSentAt?: string | null;
  pendingSendScheduledFor?: string | null;
}): string | null {
  return opts.lastEmailSentAt || opts.pendingSendScheduledFor || null;
}

export function boardDateMetaLine(opts: {
  lastEmailSentAt?: string | null;
  pendingSendScheduledFor?: string | null;
}): string | null {
  const countedIso = countedForIso(opts);
  const counted = countedIso ? formatBoardDate(countedIso) : null;
  const sent = opts.lastEmailSentAt ? formatBoardDateTime(opts.lastEmailSentAt) : null;
  const parts: string[] = [];
  if (counted) parts.push(`Counted ${counted}`);
  if (sent) parts.push(`Sent ${sent}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

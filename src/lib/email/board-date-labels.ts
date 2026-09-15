/** Short date/time labels for leads board + Outbox cards (daily-cap day + sent time). */

export function formatBoardDate(iso: string): string | null {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  const now = new Date();
  const sameYear = at.getFullYear() === now.getFullYear();
  return at.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

export function formatBoardDateTime(iso: string): string | null {
  const datePart = formatBoardDate(iso);
  if (!datePart) return null;
  const at = new Date(iso);
  const timePart = at.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
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

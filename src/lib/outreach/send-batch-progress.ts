export function progressFromRemaining(total: number, remaining: number): { completed: number; total: number } {
  const safeTotal = Math.max(0, total);
  const completed = Math.max(0, Math.min(safeTotal, safeTotal - Math.max(0, remaining)));
  return { completed, total: safeTotal };
}

const UUID_PREFIX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:\s*/i;

function normalizeBatchQueueError(raw: string): string {
  const msg = raw.replace(UUID_PREFIX, "").trim() || "Send failed";
  if (/no usable email/i.test(msg)) {
    return "Contact has no usable email address. Add one with Add another email, then send.";
  }
  if (/to is empty/i.test(msg) || /firstname@/i.test(msg)) {
    return "To is empty. Pick an inbox from Send to, or add one. firstname@ and lastname@ guesses are not sent until you select them.";
  }
  const named = msg.match(/^[^:]{1,80}:\s(.+)$/);
  return named?.[1]?.trim() || msg;
}

/** Collapse repeated Send All errors and drop raw lead ids. */
export function summarizeBatchQueueErrors(errors: string[]): string[] {
  const counts = new Map<string, number>();
  for (const raw of errors) {
    const msg = normalizeBatchQueueError(raw);
    counts.set(msg, (counts.get(msg) ?? 0) + 1);
  }
  return [...counts.entries()].map(([msg, n]) => {
    if (n <= 1) return msg;
    if (/no usable email/i.test(msg)) {
      return `${n} contacts have no usable email. Add one with Add another email, then Send All.`;
    }
    if (/to is empty/i.test(msg) || /firstname@/i.test(msg)) {
      return `${n} contacts only have firstname@ or lastname@ guesses. Pick an inbox on the card, then Send All.`;
    }
    return `${n} leads: ${msg}`;
  });
}

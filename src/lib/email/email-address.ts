/** Pull a lowercase email address out of `Name <addr>` or a bare address. */
export function extractEmailAddress(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const angled = trimmed.match(/<([^>]+@[^>]+)>/);
  const value = (angled?.[1] ?? trimmed).trim().toLowerCase();
  return value.includes("@") ? value : undefined;
}

export function extractEmailAddresses(to?: string | string[] | null): string[] {
  const list = Array.isArray(to) ? to : to ? [to] : [];
  const emails = list.map((value) => extractEmailAddress(value)).filter((value): value is string => Boolean(value));
  return [...new Set(emails)];
}

export function normalizeEmailSubject(subject?: string | null): string {
  return (subject ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

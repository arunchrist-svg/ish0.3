const SPAMMY_KEYWORD = /\b(free|guaranteed|act now|limited time|no pressure|complimentary)\b/i;

/** Cap, trim, and drop empty or spammy email-focus phrases. */
export function normalizeEmailKeywords(raw: unknown, max = 8): string[] {
  const items = Array.isArray(raw)
    ? raw
    : typeof raw === "string"
      ? raw.split(/[,;\n]/)
      : [];
  const out: string[] = [];
  for (const item of items) {
    const s = String(item ?? "").trim().replace(/\s+/g, " ");
    if (!s || s.length > 60) continue;
    if (SPAMMY_KEYWORD.test(s)) continue;
    if (out.some((k) => k.toLowerCase() === s.toLowerCase())) continue;
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

export function writeupFromSummary(productSummary: string): string {
  const parts = productSummary
    .split(/(?<=\.)\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.slice(0, 3).join(" ").trim();
}

export function emailKeywordsToInput(keywords?: string[]): string {
  return (keywords ?? []).join(", ");
}

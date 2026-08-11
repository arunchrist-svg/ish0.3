/** Company name for email subject/body: brand name only, no legal entity suffix. */

const LEGAL_SUFFIX =
  /\b(india\s+)?(private\s+limited|pvt\.?\s*ltd\.?|pvt|ltd\.?|limited|llp|inc\.?|incorporated|corp\.?|corporation|plc|gmbh|llc)\b\.?/gi;

/**
 * "Seg Automotive India Pvt Ltd" → "Seg Automotive"
 * "India Sweet House" stays "India Sweet House"
 */
export function companyNameForEmail(raw: string | null | undefined, fallback = "your team"): string {
  const original = (raw ?? "").trim();
  if (!original) return fallback;

  let name = original
    .replace(LEGAL_SUFFIX, " ")
    .replace(/[,\u2013\u2014\-–]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Leftover country tag after stripping "… India Pvt Ltd"
  name = name.replace(/\s+india$/i, "").trim();

  name = name.replace(/[,\s.]+$/g, "").trim();

  return name || original || fallback;
}

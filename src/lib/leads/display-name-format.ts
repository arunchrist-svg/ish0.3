/** Display casing helpers for person and company names on leads. */

const LETTERS = /[A-Za-z]/g;

const COMPANY_SMALL_WORDS = new Set([
  "and",
  "of",
  "the",
  "for",
  "at",
  "in",
  "by",
  "to",
  "a",
  "an",
]);

const COMPANY_KEEP_UPPER = new Set([
  "hr",
  "ceo",
  "cfo",
  "cto",
  "coo",
  "cmo",
  "chro",
  "cpo",
  "vp",
  "llp",
  "llc",
  "plc",
  "gmbh",
  "inc",
  "pvt",
  "ltd",
  "it",
  "ai",
  "uk",
  "usa",
  "uae",
]);

function letterOnly(value: string): string {
  return (value.match(LETTERS) ?? []).join("");
}

/** True when the string is ALL CAPS or all lowercase (letters only). */
export function needsLetterCasingFix(value: string | null | undefined): boolean {
  const letters = letterOnly(value ?? "");
  if (letters.length < 2) return false;
  const allUpper = letters === letters.toUpperCase();
  const allLower = letters === letters.toLowerCase();
  return allUpper || allLower;
}

/** Title-case a single token; preserves single-letter initials like "C" / "C.". */
export function titleCaseToken(token: string): string {
  if (!token) return token;
  if (/^[A-Za-z]\.?$/.test(token)) {
    const letter = token[0]!.toUpperCase();
    return token.endsWith(".") ? `${letter}.` : letter;
  }
  if (token.includes("-")) {
    return token.split("-").map(titleCaseToken).join("-");
  }
  if (token.includes("'")) {
    return token
      .split("'")
      .map((part, i) => (i === 0 ? titleCaseToken(part) : titleCaseToken(part)))
      .join("'");
  }
  return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
}

/**
 * Person display name: "RENUKA M" → "Renuka M", "jose antonio" → "Jose Antonio".
 * Leaves mixed-case names unchanged.
 */
export function formatPersonDisplayName(raw: string | null | undefined): string {
  const name = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!name || !needsLetterCasingFix(name)) return name;
  return name
    .split(" ")
    .map((part) => titleCaseToken(part))
    .join(" ");
}

function formatCompanyToken(token: string, index: number): string {
  const bare = token.replace(/\.+$/, "");
  const lower = bare.toLowerCase();
  const trailingDots = token.slice(bare.length);

  if (COMPANY_KEEP_UPPER.has(lower)) {
    return bare.toUpperCase() + trailingDots;
  }
  if (index > 0 && COMPANY_SMALL_WORDS.has(lower)) {
    return lower + trailingDots;
  }
  return titleCaseToken(bare) + trailingDots;
}

/**
 * Company display name for ALL-CAPS / all-lowercase rows.
 * "QUALIFOUR AUTO PRODUCTS INDIA PRIVATE LIMITED" → "Qualifour Auto Products India Private Limited"
 */
export function formatCompanyDisplayName(raw: string | null | undefined): string {
  const name = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!name || !needsLetterCasingFix(name)) return name;
  return name
    .split(" ")
    .map((part, i) => formatCompanyToken(part, i))
    .join(" ");
}

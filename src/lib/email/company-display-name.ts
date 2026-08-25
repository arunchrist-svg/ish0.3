/** Company name for email subject/body: brand name only, no legal entity suffix. */

export const LEGAL_ENTITY_PHRASE =
  /\b(india\s+)?(private\s+limited|pvt\.?\s*ltd\.?|pvt|ltd\.?|limited|llp|inc\.?|incorporated|corp\.?|corporation|plc|gmbh|llc)\b\.?/gi;

const LEGAL_SUFFIX = LEGAL_ENTITY_PHRASE;

/** Job titles, addresses, listing noise, and other non-trading-name junk. */
const NON_COMPANY_JUNK =
  /^(careers?|jobs?|hiring|about(\s+us)?|home|contact|blog|news|press|hr|admin|administration|untitled|n\/?a|nil|none|team|department)$/i;

const JOB_OR_DEGREE_JUNK =
  /\b(jobs?|openings?|vacancies|hiring|careers?)\s*$/i;

const ADDRESS_OR_PLACE_NAME =
  /\b(sipcot|sidco|midc|gidc|industrial\s+(area|estate|complex|park)|plot\s*no\.?|pincode|pin\s*code|layout|colony|nagar|main\s+road|\bstreet\b|\broad\b)\b/i;

const TITLE_PREFIX = /^title\s*:\s*/i;

/**
 * "Seg Automotive India Pvt Ltd" → "Seg Automotive"
 * "India Sweet House" stays "India Sweet House"
 * "MV Pvt Ltd" → "MV"
 */
export function stripLegalSuffixesFromName(raw: string): string {
  let name = raw
    .replace(TITLE_PREFIX, "")
    .replace(LEGAL_SUFFIX, " ")
    .replace(/[,\u2013\u2014\-–]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Leftover country tag after stripping "… India Pvt Ltd"
  name = name.replace(/\s+india$/i, "").trim();
  name = name.replace(/[,\s.]+$/g, "").trim();
  return name;
}

/**
 * True when the string can stand in as a short company trading name in email copy.
 * Rejects empty, pure legal suffixes, and obvious non-company junk.
 */
export function isUsableCompanyNameForEmail(raw: string | null | undefined): boolean {
  const original = (raw ?? "").trim();
  if (!original) return false;

  const stripped = stripLegalSuffixesFromName(original);
  if (!stripped || stripped.length < 2) return false;
  if (NON_COMPANY_JUNK.test(stripped)) return false;
  if (JOB_OR_DEGREE_JUNK.test(stripped)) return false;
  if (ADDRESS_OR_PLACE_NAME.test(stripped) && stripped.split(/\s+/).length <= 3) return false;
  return true;
}

/**
 * Brand name for subject/body. Falls back to "your team" when empty or unusable.
 */
export function companyNameForEmail(raw: string | null | undefined, fallback = "your team"): string {
  const original = (raw ?? "").trim();
  if (!original) return fallback;
  if (!isUsableCompanyNameForEmail(original)) return fallback;

  const name = stripLegalSuffixesFromName(original);
  return name || fallback;
}

/** Phrases safe to strip from copy (not bare "limited" / "inc" which appear in normal English). */
const LEGAL_ENTITY_IN_COPY =
  /\b(india\s+)?(private\s+limited|pvt\.?\s*ltd\.?|llp|incorporated|corporation|gmbh)\b\.?/gi;

const LEGAL_ENTITY_SHORT_SUFFIX =
  /\b(pvt|ltd|llc|plc|inc|corp)\b\.?/gi;

/**
 * Remove legal-entity phrasing from generated subject/body so AI re-appends cannot survive.
 * Prefer replacing the full legal company string with the short trading name when known.
 */
export function scrubLegalEntityCopy(
  text: string,
  shortCompany?: string | null,
): string {
  if (!text) return text;

  let out = text;

  if (shortCompany?.trim()) {
    const short = shortCompany.trim();
    // "MV Pvt Ltd" / "MV Private Limited" → "MV" when short is MV
    const withSuffix = new RegExp(
      `\\b${escapeRegex(short)}\\s+(?:india\\s+)?(?:private\\s+limited|pvt\\.?\\s*ltd\\.?|pvt|ltd\\.?|limited|llp|inc\\.?|incorporated|corp\\.?|corporation|plc|gmbh|llc)\\b\\.?`,
      "gi",
    );
    out = out.replace(withSuffix, short);
  }

  out = out.replace(LEGAL_ENTITY_IN_COPY, " ");
  // Bare short suffixes only when they look like leftover entity tags (not mid-sentence English)
  out = out.replace(
    new RegExp(`(?:\\s|,|;|:)${LEGAL_ENTITY_SHORT_SUFFIX.source}`, "gi"),
    " ",
  );
  out = out.replace(/[ \t]{2,}/g, " ");
  out = out.replace(/ +\n/g, "\n");
  out = out.replace(/\n{3,}/g, "\n\n");
  return out.trim();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

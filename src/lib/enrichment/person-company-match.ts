import { distinctiveBrandTokens } from "@/lib/enrichment/company-domain-quality";
import {
  compactCompanyName,
  isGeographicEntity,
  nameMatchesQuery,
  normalizeCompanyName,
} from "@/lib/enrichment/company-name-match";
import { linkedInSlug } from "@/lib/utils";

const FORMER_RE = /\b(ex|former|formerly|previously|past|alumni|alumnus|alumna)\b/i;
/** LinkedIn SERP, hashtags, photo-frame OCR (#OPENTOWORK), and job-seeker headlines. */
const OPEN_TO_WORK_RE =
  /#?\s*open[\s\u2010-\u2015_\-]*to[\s\u2010-\u2015_\-]*work|\bopentowork\b|\bopen_to_work\b|#opentowork|\blooking for (a )?new opportunit(?:y|ies)\b|\bseeking (new )?opportunit(?:y|ies)\b|\bopen to (new )?opportunit(?:y|ies)\b|\bactively looking for (new )?opportunit(?:y|ies)\b|\bavailable for (new )?opportunit(?:y|ies)\b|\bjob[\s-]?seeker\b/i;

export function isOpenToWorkProfile(text: string): boolean {
  return OPEN_TO_WORK_RE.test(text);
}

/** Title, bio, name, and LinkedIn URL — photo-frame hashtags sometimes land in any of these. */
export function personLooksOpenToWork(person: {
  name?: string | null;
  title?: string | null;
  bio?: string | null;
  linkedIn?: string | null;
}): boolean {
  return isOpenToWorkProfile(
    `${person.name ?? ""}\n${person.title ?? ""}\n${person.bio ?? ""}\n${person.linkedIn ?? ""}`,
  );
}

function hitBlob(hit: { title: string; url?: string; content: string }): string {
  return `${hit.title}\n${hit.url ?? ""}\n${hit.content}`;
}

/**
 * True when this person shows up on any Open to Work snippet.
 * A clean company-page hit must not override a LinkedIn headline that says Open to Work.
 */
export function personAppearsOnOpenToWorkHit(
  person: { name?: string | null; linkedIn?: string | null },
  hits: { title: string; url: string; content: string }[],
): boolean {
  const slug = linkedInSlug(person.linkedIn);
  const name = person.name?.trim().toLowerCase();
  const nameTokens = (name ?? "").split(/\s+/).filter(Boolean);
  const firstLast =
    nameTokens.length >= 2 ? `${nameTokens[0]} ${nameTokens[nameTokens.length - 1]}` : name;

  return hits.some((hit) => {
    const blob = hitBlob(hit);
    if (!isOpenToWorkProfile(blob)) return false;
    const hay = blob.toLowerCase();
    const url = (hit.url ?? "").toLowerCase();
    if (slug && (hay.includes(slug) || url.includes(slug))) return true;
    if (name && name.length >= 5 && hay.includes(name)) return true;
    if (firstLast && firstLast.length >= 5 && hay.includes(firstLast)) return true;
    return false;
  });
}

const TITLE_ROLE_TOKENS = new Set([
  "plant",
  "head",
  "director",
  "manager",
  "deputy",
  "chief",
  "officer",
  "president",
  "vice",
  "senior",
  "junior",
  "executive",
  "assistant",
  "associate",
  "consultant",
  "engineer",
  "engineering",
  "software",
  "developer",
  "analyst",
  "specialist",
  "coordinator",
  "supervisor",
  "general",
  "human",
  "resources",
  "people",
  "talent",
  "culture",
  "ops",
  "operations",
  "sales",
  "marketing",
  "finance",
  "admin",
  "administration",
  "legal",
  "site",
  "lead",
  "leader",
  "partner",
  "business",
  "global",
  "regional",
  "national",
  "division",
  "process",
  "npd",
  "chro",
  "cpo",
  "ceo",
  "cfo",
  "cto",
  "cmo",
  "coo",
  "hrbp",
  "hr",
  "procurement",
  "purchase",
  "purchasing",
  "sourcing",
  "facilities",
  "facility",
  "freelance",
  "independent",
  "self",
  "employed",
  "corporate",
  "relations",
  "strategy",
  "engagement",
  "incharge",
  "voice",
  "content",
  "strategist",
  "coach",
  "career",
]);

const DEPARTMENT_PHRASE_RE =
  /^(?:of|for|and|&)\b|^(?:human\s+resources|people(?:\s*&\s*|\s+and\s+)?culture|talent(?:\s+management)?|procurement|purchase|sourcing|facilities|operations|marketing|finance|admin(?:istration)?|sales|corporate\s+relations)\b/i;

/** Legal suffixes stripped before comparing operating entities (subsidiary vs parent). */
const ENTITY_SUFFIX_TOKENS = new Set([
  "private",
  "limited",
  "pvt",
  "ltd",
  "llp",
  "inc",
  "incorporated",
  "corp",
  "corporation",
  "plc",
  "gmbh",
  "llc",
  "co",
  "company",
  "group",
  "holdings",
  "international",
  "global",
  "the",
  "and",
  "of",
  "enterprises",
  "enterprise",
  "ventures",
  "full",
  "time",
  "part",
]);

/**
 * Common first tokens shared by many unrelated India companies.
 * Alone they must never prove employment (Sai Chemicals ≠ Sai Lifescience).
 * True short brands (TVS, HCL, IBM) are NOT in this set.
 */
const WEAK_COMPANY_PREFIXES = new Set([
  "sai",
  "sri",
  "shri",
  "shree",
  "the",
  "new",
  "old",
  "for",
  "and",
  "my",
  "our",
  "best",
  "top",
  "india",
  "indian",
  "bharat",
  "national",
  "united",
  "general",
  "global",
  "royal",
  "modern",
  "premier",
  "prime",
  "super",
  "mega",
  "om",
  "jai",
]);

export function isWeakCompanyPrefix(token: string): boolean {
  return WEAK_COMPANY_PREFIXES.has(token.toLowerCase().trim());
}

/** Tokens that identify the operating entity, keeping subsidiary markers like trading/motor/india. */
export function entityTokens(name: string): string[] {
  return normalizeCompanyName(name)
    .split(" ")
    .filter((token) => token.length > 1 && !ENTITY_SUFFIX_TOKENS.has(token));
}

/** "Tata Steel(Hosur)" → "Tata Steel" when the parenthetical is a plant city, not a company name. */
function normalizeOperatingEntityForMatch(entity: string): string {
  const parenMatch = entity.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (!parenMatch) return entity;
  const base = parenMatch[1]?.trim() ?? "";
  const inner = parenMatch[2]?.trim() ?? "";
  if (base && inner && isGeographicEntity(inner)) return base;
  return entity;
}

/**
 * True when the person's operating entity and the scouted company refer to the same legal unit.
 * Rejects parent-brand matches when the profile names a more specific subsidiary
 * (e.g. "Nissan Trading India" on a "Nissan" or "Nissan Motor Corporation" scout).
 * Allows short headline brands when the person is less specific than the scout (TVS vs TVS Motor).
 */
export function entitiesReferToSameCompany(personEntity: string, scoutCompany: string): boolean {
  const normalizedPerson = normalizeOperatingEntityForMatch(personEntity);
  const pTokens = entityTokens(normalizedPerson);
  const sTokens = entityTokens(scoutCompany);
  if (!pTokens.length || !sTokens.length) return nameMatchesQuery(normalizedPerson, scoutCompany);

  const pExtra = pTokens.filter((token) => !sTokens.includes(token));
  const sExtra = sTokens.filter((token) => !pTokens.includes(token));

  // Profile names a more specific or sibling unit (Nissan Trading vs Nissan, Sai Lifescience vs Sai Chemicals).
  if (pExtra.length > 0) return false;

  // Weak prefix-only person brand ("Sai") must not match multi-token scouts ("Sai Chemicals").
  // Short true brands (TVS, HCL) still match a longer scout name.
  if (
    pTokens.length === 1 &&
    sTokens.length >= 2 &&
    (WEAK_COMPANY_PREFIXES.has(pTokens[0]!) || (pTokens[0]?.length ?? 0) < 3)
  ) {
    return false;
  }

  // Person is the same or less specific than the scout (TVS headline, TVS Motor scout).
  void sExtra;
  return true;
}

/** Operating unit in LinkedIn titles like "Head - HR ( Nissan Trading India )". */
export function operatingEntityFromParentheses(text: string): string | null {
  for (const match of text.matchAll(/\(([^()]{3,80})\)/g)) {
    const candidate = (match[1] ?? "").trim();
    if (!candidate || looksLikeRoleOrDepartment(candidate)) continue;

    const tokens = normalizeCompanyName(candidate).split(" ").filter(Boolean);
    if (tokens.length === 1) {
      if (isGeographicEntity(candidate)) continue;
      // Skip role acronyms: (CHRO), (VP), (HRBP)
      if (candidate.length <= 5 && /^[A-Z]{2,5}$/.test(candidate.replace(/\s+/g, ""))) continue;
    }

    if (tokens.length >= 2 || tokens.some((token) => !TITLE_ROLE_TOKENS.has(token) && token.length >= 4)) {
      return candidate;
    }
  }
  return null;
}

/** Most specific employer named in a LinkedIn title or experience snippet. */
export function specificOperatingEntityFromProfile(title: string, content?: string): string | null {
  const fromTitle = operatingEntityFromParentheses(title);
  if (fromTitle) return fromTitle;
  if (content) {
    const fromContent = operatingEntityFromParentheses(content);
    if (fromContent) return fromContent;
  }
  return embeddedEmployerFromTitle(title) ?? currentEmployerFromHeadline(title);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const WEAK_SHORT_BRAND_TOKENS = new Set(["sri", "shri", "the", "and", "new", "old", "for"]);

function companyNeedles(companyName: string): string[] {
  const needles = new Set<string>();
  const trimmed = companyName.trim();
  if (trimmed) needles.add(trimmed.toLowerCase());
  const normalized = normalizeCompanyName(companyName);
  if (normalized) needles.add(normalized);
  const tokens = entityTokens(companyName);
  const first = tokens[0] ?? normalized.split(" ")[0];
  // Only use the first token alone when it is a real brand, not a shared prefix.
  if (first && first.length >= 5 && !WEAK_COMPANY_PREFIXES.has(first) && tokens.length === 1) {
    needles.add(first);
  }
  // Short brands (TVS, HCL, IBM) otherwise fail "HR at TVS" vs "TVS Motor Company".
  for (const token of distinctiveBrandTokens(companyName)) {
    if (WEAK_COMPANY_PREFIXES.has(token) && tokens.length >= 2) continue;
    if (token.length >= 5) needles.add(token);
    if (token.length >= 3 && token.length < 5 && !WEAK_SHORT_BRAND_TOKENS.has(token)) {
      needles.add(token);
    }
  }
  // Employment matching must keep distinguishing unit words even when domain-quality
  // treats them as generic (chemicals, trading, steel).
  if (tokens.length >= 2) {
    for (const token of tokens) {
      if (WEAK_COMPANY_PREFIXES.has(token)) continue;
      if (token.length >= 4) needles.add(token);
    }
  }
  const compact = compactCompanyName(companyName);
  if (compact.length >= 4) needles.add(compact);
  return [...needles];
}

export function textMentionsCompany(text: string, companyName: string): boolean {
  const hay = text.toLowerCase();
  if (!hay.trim() || !companyName.trim()) return false;

  const tokens = entityTokens(companyName);
  if (tokens.length >= 2) {
    const normalized = normalizeCompanyName(companyName);
    if (normalized && new RegExp(`\\b${escapeRegExp(normalized)}\\b`, "i").test(hay)) return true;
    const compact = compactCompanyName(companyName);
    if (compact.length >= 6 && hay.replace(/[^a-z0-9]/g, "").includes(compact)) return true;

    // Require distinguishing tokens (chemicals / lifescience), not only a shared prefix (sai).
    const required = tokens.filter((token) => !WEAK_COMPANY_PREFIXES.has(token));
    const need = required.length > 0 ? required : tokens;
    return need.every((token) => new RegExp(`\\b${escapeRegExp(token)}\\b`, "i").test(hay));
  }

  return companyNeedles(companyName).some((needle) =>
    new RegExp(`\\b${escapeRegExp(needle)}\\b`, "i").test(hay),
  );
}

/**
 * Returns true when the company name appears near a closed date range
 * (e.g. "Jun 2014 - Jan 2016") but NOT near an open range ("- Present").
 * LinkedIn experience snippets use this format to show past roles.
 */
function hasPastDateRangeNearCompany(text: string, companyName: string): boolean {
  const currentYear = new Date().getFullYear();
  const lower = text.toLowerCase();
  // Quick bail: if there is NO year in the text, skip.
  if (!/\b(19|20)\d{2}\b/.test(lower)) return false;

  let foundPast = false;
  for (const needle of companyNeedles(companyName)) {
    let from = 0;
    while (from < lower.length) {
      const idx = lower.indexOf(needle, from);
      if (idx < 0) break;
      // Tight window: date range appears on the same line or very shortly after company in LinkedIn snippets.
      // Deliberately narrow before the match to avoid bleeding into a previous job's "Present" range.
      const window = lower.slice(Math.max(0, idx - 40), Math.min(lower.length, idx + needle.length + 120));
      // Capture full end date: "Jun 2014 - Jan 2016" or "May 2024 - Present"
      const DATE_RANGE_RE =
        /(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec\s+)?\d{4}\s*[-–]\s*(present|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+\d{4}|\d{4})/gi;
      let m: RegExpExecArray | null;
      while ((m = DATE_RANGE_RE.exec(window)) !== null) {
        const endStr = m[1] ?? "";
        // If any occurrence shows "Present", the role is current -- not past.
        if (/^present$/i.test(endStr.trim())) return false;
        // If end contains a year clearly in the past, mark as past.
        // Use currentYear - 1 buffer: LinkedIn snippet data can be up to a year stale,
        // so "2025" on a profile indexed in late 2025 may still be a current role in 2026.
        const endYearStr = endStr.match(/\d{4}/)?.[0];
        const endYear = endYearStr ? parseInt(endYearStr) : 0;
        if (endYear > 0 && endYear < currentYear - 1) foundPast = true;
      }
      from = idx + needle.length;
    }
  }
  return foundPast;
}

/**
 * Scans the full content blob for a "Company · Date - Present" pattern and returns
 * the company name associated with the CURRENT role (the one with "- Present").
 *
 * LinkedIn snippets from Tavily often include the full experience section:
 *   "Human Resources Manager\n3M · May 2024 - Present · 2 yrs\nBengaluru\n\nHR Executive\nAron Universal · Jun 2014 - Jan 2016"
 *
 * This lets us detect when someone's CURRENT employer is different from the company
 * we are scouting, even if the snippet mentions the scouted company in a past role.
 */
/** Short alphanumeric brand codes like "3M", "HP", "GE" that looksLikeRoleOrDepartment rejects. */
function looksLikeBrandCode(candidate: string): boolean {
  return /^[a-z0-9]{1,5}$/i.test(candidate.trim());
}

function isLikelyCompanyCandidate(candidate: string): boolean {
  if (!candidate.trim()) return false;
  // Short brand codes (3M, HP, GE) are valid company names even if looksLikeRoleOrDepartment rejects them.
  if (looksLikeBrandCode(candidate)) return true;
  return !looksLikeRoleOrDepartment(candidate);
}

function currentEmployerFromContent(content: string): string | null {
  const lower = content.toLowerCase();
  if (!lower.includes("present")) return null;

  // Pattern 1: "CompanyName · StartDate - Present" (same-line bullet format)
  // Captures the token immediately before "· date - present"
  const BULLET_PRESENT_RE =
    /([^·\n]{1,60})\s*·\s*(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+)?\d{4}\s*[-–]\s*present/gi;
  let m: RegExpExecArray | null;
  while ((m = BULLET_PRESENT_RE.exec(lower)) !== null) {
    const candidate = (m[1] ?? "").trim();
    if (isLikelyCompanyCandidate(candidate)) return candidate;
  }

  // Pattern 2: "CompanyName\nStartDate - Present" (newline-separated format)
  const NL_PRESENT_RE =
    /^([^\n]{1,60})\n(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+)?\d{4}\s*[-–]\s*present/gim;
  while ((m = NL_PRESENT_RE.exec(lower)) !== null) {
    const candidate = (m[1] ?? "").trim();
    if (isLikelyCompanyCandidate(candidate)) return candidate;
  }

  return null;
}

export function hasFormerCompanyAffiliation(text: string, companyName: string): boolean {
  const lower = text.toLowerCase();
  for (const needle of companyNeedles(companyName)) {
    let from = 0;
    while (from < lower.length) {
      const idx = lower.indexOf(needle, from);
      if (idx < 0) break;
      const window = lower.slice(Math.max(0, idx - 40), idx + needle.length + 40);
      if (FORMER_RE.test(window)) return true;
      from = idx + needle.length;
    }
  }
  // Also treat a company that only appears with a closed date range as a past employer.
  return hasPastDateRangeNearCompany(text, companyName);
}

function looksLikeRoleOrDepartment(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (DEPARTMENT_PHRASE_RE.test(trimmed)) return true;
  if (isGeographicEntity(trimmed)) return true;
  const tokens = normalizeCompanyName(trimmed).split(" ").filter(Boolean);
  if (!tokens.length) return true;
  // "People & Culture", "Human Resources", "Corporate Relations"
  if (tokens.every((token) => TITLE_ROLE_TOKENS.has(token) || token.length <= 2)) return true;
  if (tokens.length <= 3 && TITLE_ROLE_TOKENS.has(tokens[0] ?? "")) return true;
  return false;
}

/** Last employer hinted by a LinkedIn-style headline. */
export function currentEmployerFromHeadline(title: string): string | null {
  const cleaned = title
    .replace(/\s*[|\-–—]\s*LinkedIn.*$/i, "")
    .replace(/\s*\|\s*LinkedIn Top Voice\b.*$/i, "")
    .trim();
  if (!cleaned) return null;

  const atMatch = cleaned.match(/\bat\s+([^|\n]+)/i);
  if (atMatch?.[1]) {
    const company = atMatch[1].replace(/\s+[|/\\·•\-–—].*$/, "").trim();
    if (company.length >= 2 && company.length < 80 && !looksLikeRoleOrDepartment(company)) {
      return company;
    }
  }

  // "CHRO - Finocontrol", "HR Director | Titan Company", "Pricol / Yashaswi Group/HR Specialist"
  const parts = cleaned
    .split(/\s*[|/\\·•\-–—]\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length >= 2) {
    for (let i = parts.length - 1; i >= 1; i--) {
      const candidate = parts[i] ?? "";
      if (candidate.length >= 2 && candidate.length < 80 && !looksLikeRoleOrDepartment(candidate)) {
        return candidate;
      }
    }
  }
  return null;
}

export function hitShowsCurrentEmployment(
  hit: { title: string; content: string },
  companyName: string,
): boolean {
  const blob = `${hit.title}\n${hit.content}`;
  if (isOpenToWorkProfile(blob)) return false;
  if (hasFormerCompanyAffiliation(blob, companyName)) return false;

  const operatingEntity = specificOperatingEntityFromProfile(hit.title, hit.content);
  if (operatingEntity) {
    if (!entitiesReferToSameCompany(operatingEntity, companyName)) return false;
    // Operating unit already validated (e.g. TVS on a TVS Motor scout, or Nissan Trading
    // rejected on Nissan). Do not re-require every scout token in the blob.
    return true;
  }

  const headlineEmployer = currentEmployerFromHeadline(hit.title);
  if (headlineEmployer) {
    if (!entitiesReferToSameCompany(headlineEmployer, companyName)) return false;
    return true;
  }

  // If the content explicitly shows "- Present" for a DIFFERENT company, this person
  // has moved on from the scouted company. Catch stale Tavily snapshots like Anusha at Aron Universal.
  const contentEmployer = currentEmployerFromContent(hit.content);
  if (contentEmployer && !entitiesReferToSameCompany(contentEmployer, companyName)) return false;

  return textMentionsCompany(blob, companyName);
}

export function personFieldsShowCurrentEmployment(
  person: { title?: string | null; bio?: string | null },
  companyName: string,
): boolean {
  return hitShowsCurrentEmployment(
    { title: person.title ?? "", content: person.bio ?? "" },
    companyName,
  );
}

/**
 * Employer embedded after a seniority word without "at",
 * e.g. "Plant Head Tata Steel(Hosur)" → "Tata Steel(Hosur)".
 * Skips department phrases like "Head of Procurement".
 */
export function embeddedEmployerFromTitle(title: string): string | null {
  const cleaned = title
    .replace(/\s*[|\-–—]\s*LinkedIn.*$/i, "")
    .replace(/\([^)]*\)/g, (chunk) => chunk)
    .trim();
  if (!cleaned) return null;

  const fromParens = operatingEntityFromParentheses(title);
  if (fromParens) return fromParens;

  const fromAt = currentEmployerFromHeadline(cleaned);
  if (fromAt) return fromAt;

  const match = cleaned.match(
    /\b(?:plant|site|regional|national|global)?\s*(?:head|director|manager|vp|vice\s+president|chief(?:\s+\w+)?\s+officer|president)\s+(.+)$/i,
  );
  const rest = match?.[1]?.replace(/^[\s\-–—:/]+/, "").trim();
  if (!rest || rest.length < 3 || rest.length > 80) return null;
  if (DEPARTMENT_PHRASE_RE.test(rest)) return null;
  const firstToken = normalizeCompanyName(rest).split(" ")[0] ?? "";
  if (TITLE_ROLE_TOKENS.has(firstToken)) return null;
  return rest;
}

/**
 * True when the job title names a different employer brand than the account
 * (e.g. "Plant Head Tata Steel" on a Hosur Steel / Jindal account).
 */
export function personTitleConflictsWithCompany(
  title: string | null | undefined,
  companyName: string,
): boolean {
  if (!title?.trim() || !companyName.trim()) return false;

  const operatingEntity = specificOperatingEntityFromProfile(title);
  if (operatingEntity && !entitiesReferToSameCompany(operatingEntity, companyName)) return true;

  const employer = embeddedEmployerFromTitle(title);
  if (!employer) return false;
  if (entitiesReferToSameCompany(employer, companyName)) return false;

  const employerBrands = distinctiveBrandTokens(employer).filter(
    (token) => !TITLE_ROLE_TOKENS.has(token) && !isGeographicEntity(token),
  );
  const companyBrands = distinctiveBrandTokens(companyName);
  const companyCompact = compactCompanyName(companyName);

  if (!employerBrands.length) {
    return !textMentionsCompany(employer, companyName);
  }

  return employerBrands.some(
    (token) =>
      token.length >= 4 &&
      !companyBrands.includes(token) &&
      !companyCompact.includes(token),
  );
}

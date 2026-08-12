import { distinctiveBrandTokens } from "@/lib/enrichment/company-domain-quality";
import {
  compactCompanyName,
  isGeographicEntity,
  nameMatchesQuery,
  normalizeCompanyName,
} from "@/lib/enrichment/company-name-match";

const FORMER_RE = /\b(ex|former|formerly|previously|past|alumni|alumnus|alumna)\b/i;

const TITLE_ROLE_TOKENS = new Set([
  "plant",
  "head",
  "director",
  "manager",
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function companyNeedles(companyName: string): string[] {
  const needles = new Set<string>();
  const trimmed = companyName.trim();
  if (trimmed) needles.add(trimmed.toLowerCase());
  const normalized = normalizeCompanyName(companyName);
  if (normalized) needles.add(normalized);
  const first = normalized.split(" ")[0];
  if (first && first.length >= 5) needles.add(first);
  return [...needles];
}

export function textMentionsCompany(text: string, companyName: string): boolean {
  const hay = text.toLowerCase();
  if (!hay.trim() || !companyName.trim()) return false;
  return companyNeedles(companyName).some((needle) =>
    new RegExp(`\\b${escapeRegExp(needle)}\\b`, "i").test(hay),
  );
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
  return false;
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
    const company = atMatch[1].replace(/\s+[|\-–—].*$/, "").trim();
    if (company.length >= 2 && company.length < 80 && !looksLikeRoleOrDepartment(company)) {
      return company;
    }
  }

  // "CHRO - Finocontrol", "HR Director | Titan Company", multi-segment headlines
  const parts = cleaned.split(/\s*[|\-–—]\s*/).map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const last = parts[parts.length - 1] ?? "";
    if (last.length >= 2 && last.length < 80 && !looksLikeRoleOrDepartment(last)) {
      return last;
    }
  }
  return null;
}

export function hitShowsCurrentEmployment(
  hit: { title: string; content: string },
  companyName: string,
): boolean {
  const blob = `${hit.title}\n${hit.content}`;
  if (hasFormerCompanyAffiliation(blob, companyName)) return false;

  const headlineEmployer = currentEmployerFromHeadline(hit.title);
  if (headlineEmployer && !nameMatchesQuery(headlineEmployer, companyName)) return false;

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

  const employer = embeddedEmployerFromTitle(title);
  if (!employer) return false;
  if (nameMatchesQuery(employer, companyName)) return false;

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

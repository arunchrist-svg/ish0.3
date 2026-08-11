import { distinctiveBrandTokens } from "@/lib/enrichment/company-domain-quality";
import {
  compactCompanyName,
  isGeographicEntity,
  nameMatchesQuery,
  normalizeCompanyName,
} from "@/lib/enrichment/company-name-match";

const FORMER_RE = /\b(ex|former|formerly|previously|past|alumni|alumnus|alumna)\b/i;

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

/** Last employer hinted by a LinkedIn-style headline. */
export function currentEmployerFromHeadline(title: string): string | null {
  const cleaned = title
    .replace(/\s*[|\-–—]\s*LinkedIn.*$/i, "")
    .trim();
  if (!cleaned) return null;

  const atMatch = cleaned.match(/\bat\s+([^|\n]+)/i);
  if (atMatch?.[1]) {
    const company = atMatch[1].replace(/\s+[|\-–—].*$/, "").trim();
    if (company.length >= 2 && company.length < 80) return company;
  }

  const parts = cleaned.split(/\s*[|\-–—]\s*/).map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 3) return parts[parts.length - 1] ?? null;
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
  "analyst",
  "specialist",
  "coordinator",
  "supervisor",
  "general",
  "human",
  "resources",
  "people",
  "talent",
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
  "engineering",
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
]);

/**
 * True when the job title names a different employer brand than the account
 * (e.g. "Plant Head Tata Steel" on a Hosur Steel / Jindal account).
 */
export function personTitleConflictsWithCompany(
  title: string | null | undefined,
  companyName: string,
): boolean {
  if (!title?.trim() || !companyName.trim()) return false;

  const headlineEmployer = currentEmployerFromHeadline(title);
  if (headlineEmployer && !nameMatchesQuery(headlineEmployer, companyName)) {
    const employerBrands = distinctiveBrandTokens(headlineEmployer);
    const companyBrands = distinctiveBrandTokens(companyName);
    if (
      employerBrands.some(
        (token) =>
          token.length >= 4 &&
          !companyBrands.includes(token) &&
          !compactCompanyName(companyName).includes(token),
      )
    ) {
      return true;
    }
  }

  const titleBrands = distinctiveBrandTokens(title).filter(
    (token) => !TITLE_ROLE_TOKENS.has(token) && !isGeographicEntity(token),
  );
  const companyBrands = distinctiveBrandTokens(companyName);
  const companyCompact = compactCompanyName(companyName);
  return titleBrands.some(
    (token) =>
      token.length >= 4 &&
      !companyBrands.includes(token) &&
      !companyCompact.includes(token),
  );
}

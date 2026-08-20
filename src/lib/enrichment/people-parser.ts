import type { ScoutPersonResult } from "./types";
import { computeSeniorityScore } from "./seniority-score";
import { normalizeLinkedInUrl } from "@/lib/utils";
import {
  hitShowsCurrentEmployment,
  isOpenToWorkProfile,
  personAppearsOnOpenToWorkHit,
  personLooksOpenToWork,
  personTitleConflictsWithCompany,
} from "@/lib/enrichment/person-company-match";
import { sanitizeJobTitle } from "@/lib/enrichment/job-title";
import { inferRoleFromTitle, isTeamLeadTitle } from "@/lib/enrichment/people-role-filter";

type SearchHit = { title: string; url: string; content: string };

const LINKEDIN_IN_RE = /(?:https?:\/\/)?(?:[\w-]+\.)?linkedin\.com\/in\/([a-zA-Z0-9%-]+)/gi;
const JUNK_NAME =
  /^(linkedin|profile|people|team|about|contact|home|sign in|login|unknown)$/i;

function slugToName(slug: string): string | null {
  const decoded = decodeURIComponent(slug).replace(/-/g, " ").trim();
  const name = decoded
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\s+/g, " ")
    .trim();
  if (name.length < 4 || name.length > 60) return null;
  if (JUNK_NAME.test(name)) return null;
  if (/^\d+$/.test(name)) return null;
  return name;
}

function extractLocation(text: string): string | undefined {
  const india = text.match(
    /\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)\s*,\s*(Maharashtra|Karnataka|Tamil Nadu|Telangana|Kerala|Gujarat|Rajasthan|Delhi|Haryana|Punjab|West Bengal|India)\b/,
  );
  if (india) return `${india[1]}, ${india[2]}`;

  const us = text.match(
    /\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)\s*,\s*(Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming|United States|USA)\b/,
  );
  if (us) return `${us[1]}, ${us[2]}`;

  const area = text.match(/\b(Greater\s+[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*\s+Area)\b/);
  if (area) return area[1];

  const country = text.match(
    /\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*),\s*(United States|USA|United Kingdom|UK|Canada|Australia)\b/,
  );
  if (country) return `${country[1]}, ${country[2]}`;

  return undefined;
}

function parseLinkedInTitle(title: string): { name?: string; title?: string; location?: string } {
  const cleaned = title
    .replace(/\s*[|\-–—]\s*LinkedIn.*$/i, "")
    .replace(/\s*on LinkedIn.*$/i, "")
    .trim();
  const location = extractLocation(cleaned);
  const parts = cleaned.split(/\s*[|\-–—]\s*/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return { name: parts[0], title: sanitizeJobTitle(parts.slice(1).join(" · ")), location };
  }
  return parts[0] ? { name: parts[0], location } : { location };
}

function isKeyDM(title?: string): boolean {
  if (!title) return false;
  const t = title.toLowerCase();
  return ["hr", "admin", "procurement", "chief", "director", "head", "vp", "manager", "people"].some(
    (k) => t.includes(k),
  );
}

function collectLinkedInHits(
  hits: SearchHit[],
  companyName?: string,
): { name: string; title?: string; linkedIn: string; location?: string; bio?: string }[] {
  const out: { name: string; title?: string; linkedIn: string; location?: string; bio?: string }[] = [];
  const seen = new Set<string>();

  for (const hit of hits) {
    const blob = `${hit.title}\n${hit.url}\n${hit.content}`;
    if (isOpenToWorkProfile(blob) || isTeamLeadTitle(`${hit.title}\n${hit.content}`)) continue;
    if (companyName && !hitShowsCurrentEmployment(hit, companyName)) continue;
    const fromTitle = parseLinkedInTitle(hit.title);

    for (const match of blob.matchAll(LINKEDIN_IN_RE)) {
      const slug = match[1]?.split("?")[0] ?? "";
      const linkedIn = normalizeLinkedInUrl(`linkedin.com/in/${slug}`);
      if (!linkedIn) continue;

      const key = linkedIn.toLowerCase();
      if (seen.has(key)) continue;

      const name = fromTitle.name && fromTitle.name.length >= 4
        ? fromTitle.name
        : slugToName(slug);
      if (!name || JUNK_NAME.test(name)) continue;
      if (personLooksOpenToWork({ name, title: fromTitle.title, bio: hit.content, linkedIn })) {
        continue;
      }
      if (
        companyName &&
        fromTitle.title &&
        personTitleConflictsWithCompany(fromTitle.title, companyName)
      ) {
        continue;
      }

      if (personAppearsOnOpenToWorkHit({ name, linkedIn }, hits)) continue;

      seen.add(key);
      out.push({
        name,
        title: fromTitle.title,
        linkedIn,
        location: fromTitle.location ?? extractLocation(blob),
        bio: hit.content.slice(0, 400) || undefined,
      });
    }
  }

  return out;
}

/** Heuristic fallback when LLM people extraction is unavailable or returns nothing. */
export function parsePeopleFromSearchResults(
  hits: SearchHit[],
  limit: number,
  dataSource = "web_heuristic",
  companyName?: string,
): ScoutPersonResult[] {
  const candidates = collectLinkedInHits(hits, companyName);
  return candidates.slice(0, limit).map((c) => {
    const inferred = inferRoleFromTitle(c.title);
    return {
      name: c.name,
      title: c.title,
      department: inferred.department,
      seniority: inferred.seniority,
      location: c.location,
      linkedIn: c.linkedIn,
      bio: c.bio,
      email: undefined,
      emailStatus: "missing" as const,
      isKeyDM: isKeyDM(c.title),
      matchScore: computeSeniorityScore({
        title: c.title,
        isKeyDM: isKeyDM(c.title),
        emailStatus: "missing",
        linkedIn: c.linkedIn,
      }).total,
      dataSource,
    };
  });
}

import { normalizeCompanyName } from "@/lib/enrichment/company-name-match";
import { computeSeniorityScore, sortPeopleByScore } from "@/lib/enrichment/seniority-score";
import type { ScoutPersonResult } from "@/lib/enrichment/types";
import { MAX_SCOUT_LEADS_LIMIT } from "@/lib/enrichment/config";
import { personMatchesRoles } from "@/lib/enrichment/people-role-filter";

/** Matches Settings → Scout Volume "Leads per company" max. */
export const MAX_PEOPLE_PER_COMPANY = MAX_SCOUT_LEADS_LIMIT;

export function peoplePerCompanyLimit(scoutLeadsLimit: number): number {
  const n = Number.isFinite(scoutLeadsLimit) ? Math.round(scoutLeadsLimit) : 1;
  return Math.min(MAX_PEOPLE_PER_COMPANY, Math.max(1, n));
}

/**
 * Stable bucket for a scouted company.
 * Prefer company id so distinct selected companies are never merged by shared brand words
 * (e.g. Tata Steel vs Tata Motors, Infosys vs Infosys BPM).
 */
export function companyPeopleBucket(companyName: string, fallbackId?: string): string {
  const id = (fallbackId ?? "").trim().toLowerCase();
  if (id) return `id:${id}`;
  const normalized = normalizeCompanyName(companyName);
  if (normalized) return `name:${normalized}`;
  return "unknown";
}

export function selectPeopleByCompanyCap<
  T extends {
    title?: string | null;
    seniority?: string | null;
    isKeyDM?: boolean;
    matchScore?: number;
    email?: string | null;
    emailStatus?: string;
    linkedIn?: string | null;
  },
>(
  people: T[],
  opts: {
    perCompany: number;
    totalLimit?: number;
    bucketOf: (person: T) => string;
  },
): T[] {
  const perCompany = Math.max(1, opts.perCompany);
  const scored = [...people].sort((a, b) => {
    const aScore = computeSeniorityScore(a).total;
    const bScore = computeSeniorityScore(b).total;
    if (bScore !== aScore) return bScore - aScore;
    return (b.matchScore ?? 0) - (a.matchScore ?? 0);
  });

  const used = new Map<string, number>();
  const picked: T[] = [];
  for (const person of scored) {
    const bucket = opts.bucketOf(person) || "unknown";
    const count = used.get(bucket) ?? 0;
    if (count >= perCompany) continue;
    used.set(bucket, count + 1);
    picked.push(person);
    if (opts.totalLimit != null && picked.length >= opts.totalLimit) break;
  }
  return picked;
}

export function rankPeopleSeniorFirst(people: ScoutPersonResult[]): ScoutPersonResult[] {
  return sortPeopleByScore(
    people.map((person) => ({ ...person, matchScore: computeSeniorityScore(person).total })),
  );
}

const GIFTING_DEPTS = new Set(["HR", "Admin", "Procurement", "Facilities"]);

/** Rank the actual buyer for this offer, not only the most senior title. */
export function rankPeopleForScout(
  people: ScoutPersonResult[],
  opts?: { seniority?: string[]; departments?: string[]; buyerPersonas?: string[] },
): ScoutPersonResult[] {
  const seniority = opts?.seniority ?? [];
  const departments = opts?.departments ?? [];
  const personas = opts?.buyerPersonas ?? [];
  if (!people.length) return people;

  return [...people]
    .map((person) => {
      const base = computeSeniorityScore(person).total;
      let bonus = 0;
      const title = `${person.title ?? ""} ${person.department ?? ""}`.toLowerCase();
      if (departments.length && personMatchesRoles(person, [], departments)) bonus += 18;
      if (seniority.length && personMatchesRoles(person, seniority, [])) bonus += 8;
      if (
        personas.some((persona) => {
          const token = persona.toLowerCase().replace(/\b(director|manager|head|lead|vp|chief)\b/g, "").trim();
          return token.length >= 2 && title.includes(token);
        })
      ) {
        bonus += 10;
      }
      if (
        departments.some((d) => GIFTING_DEPTS.has(d)) &&
        /\b(cto|cfo|engineer|software)\b/i.test(title) &&
        !/\b(hr|people|chro|admin|procurement|purchase)\b/i.test(title)
      ) {
        bonus -= 40;
      }
      return { ...person, matchScore: Math.max(0, Math.min(100, base + bonus)) };
    })
    .sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0));
}

export function scoutPeopleCoverage(params: {
  selectedCompanyIds: string[];
  people: { companyId: string }[];
}): {
  companiesWithPeople: number;
  companiesWithoutPeople: number;
  totalCompanies: number;
  emptyCompanyIds: string[];
} {
  const withPeople = new Set(params.people.map((p) => p.companyId));
  const emptyCompanyIds = params.selectedCompanyIds.filter((id) => !withPeople.has(id));
  return {
    companiesWithPeople: withPeople.size,
    companiesWithoutPeople: emptyCompanyIds.length,
    totalCompanies: params.selectedCompanyIds.length,
    emptyCompanyIds,
  };
}

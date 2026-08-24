import { normalizeCompanyName } from "@/lib/enrichment/company-name-match";
import { computeSeniorityScore, sortPeopleByScore } from "@/lib/enrichment/seniority-score";
import type { ScoutPersonResult } from "@/lib/enrichment/types";
import { MAX_SCOUT_LEADS_LIMIT } from "@/lib/enrichment/config";
import { personMatchesRoles } from "@/lib/enrichment/people-role-filter";
import {
  personLocationMatchesSelection,
  selectionLooksLikeNeighborhoods,
} from "@/lib/enrichment/city-search";

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

export type LeadScoreOpts = {
  seniority?: string[];
  departments?: string[];
  buyerPersonas?: string[];
  /** Cities used for location fit (Focus chips + parent cities). */
  preferredCities?: string[];
  /** Prefer Head/Director/Manager titles harder (pack preferDmTitles). */
  preferDmTitles?: boolean;
};

function locationFitBonus(person: ScoutPersonResult, preferredCities?: string[]): number {
  if (!preferredCities?.length) return 0;
  const loc = person.location ?? "";
  if (!loc.trim()) return 2;
  if (personLocationMatchesSelection(loc, preferredCities)) {
    return selectionLooksLikeNeighborhoods(preferredCities) ? 16 : 12;
  }
  return 0;
}

function dataCompletenessBonus(person: ScoutPersonResult): number {
  let bonus = 0;
  if (person.linkedIn?.trim()) bonus += 6;
  if ((person.title ?? "").trim()) bonus += 4;
  if (person.isKeyDM) bonus += 4;
  return bonus;
}

/** Rank the actual buyer for this offer, not only the most senior title. */
export function rankPeopleForScout(
  people: ScoutPersonResult[],
  opts?: LeadScoreOpts,
): ScoutPersonResult[] {
  const seniority = opts?.seniority ?? [];
  const departments = opts?.departments ?? [];
  const personas = opts?.buyerPersonas ?? [];
  const preferDm = opts?.preferDmTitles !== false;
  if (!people.length) return people;

  return [...people]
    .map((person) => {
      const base = computeSeniorityScore(person).total;
      let bonus = 0;
      const title = `${person.title ?? ""} ${person.department ?? ""}`.toLowerCase();
      if (departments.length && personMatchesRoles(person, [], departments)) bonus += 18;
      if (seniority.length && personMatchesRoles(person, seniority, [])) bonus += 8;
      if (
        preferDm &&
        departments.some((d) => GIFTING_DEPTS.has(d)) &&
        /\b(hr|people|chro|procurement|purchase|sourcing|admin|facilit)\b/i.test(title) &&
        /\b(director|head|vp|chro|chief|manager)\b/i.test(title)
      ) {
        bonus += 14;
      }
      if (
        preferDm &&
        /\b(director|head|vp|chro|chief)\b/i.test(title) &&
        !/\b(executive|officer|coordinator|assistant)\b/i.test(title)
      ) {
        bonus += 6;
      }
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
      bonus += locationFitBonus(person, opts?.preferredCities);
      bonus += dataCompletenessBonus(person);
      return { ...person, matchScore: Math.max(0, Math.min(100, base + bonus)) };
    })
    .sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0));
}

/**
 * Over-fetch then keep the high-confidence gold slice for manual select.
 * People below a soft floor are dropped only when enough stronger leads exist.
 */
export function trimPeopleToHighConfidence(
  people: ScoutPersonResult[],
  limit: number,
  opts?: { minScore?: number },
): ScoutPersonResult[] {
  if (!people.length) return people;
  const cap = Math.max(1, limit);
  const minScore = opts?.minScore ?? 35;
  const strong = people.filter((p) => (p.matchScore ?? 0) >= minScore);
  if (strong.length >= Math.min(3, cap)) {
    return strong.slice(0, cap);
  }
  return people.slice(0, cap);
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

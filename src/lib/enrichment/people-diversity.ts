import { normalizeCompanyName } from "@/lib/enrichment/company-name-match";
import { computeSeniorityScore, sortPeopleByScore } from "@/lib/enrichment/seniority-score";
import type { ScoutPersonResult } from "@/lib/enrichment/types";

export const MAX_PEOPLE_PER_COMPANY = 3;

export function peoplePerCompanyLimit(scoutLeadsLimit: number): number {
  const n = Number.isFinite(scoutLeadsLimit) ? Math.round(scoutLeadsLimit) : 1;
  return Math.min(MAX_PEOPLE_PER_COMPANY, Math.max(1, n));
}

/** Group Taurus CG / Taurus Group B.V. under the same cap bucket. */
export function companyPeopleBucket(companyName: string, fallbackId?: string): string {
  const normalized = normalizeCompanyName(companyName);
  const first = normalized.split(/\s+/).filter(Boolean)[0] ?? "";
  if (first.length >= 4) return first;
  if (normalized) return normalized;
  return (fallbackId ?? "").trim().toLowerCase() || "unknown";
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

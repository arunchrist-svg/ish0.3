import type { ScoutPersonResult } from "./types";

export const SENIORITY_TITLES: Record<string, string[]> = {
  "C-Level": ["CEO", "COO", "CHRO", "CPO", "CXO", "Chief"],
  Founders: ["Founder", "Co-Founder", "Co-founder", "Founding"],
  VP: ["VP", "Vice President"],
  Director: ["Director"],
  Manager: ["Manager", "Head"],
};

export const DEPARTMENT_TITLES: Record<string, string[]> = {
  HR: ["HR", "Human Resources", "People", "CHRO", "CPO"],
  Admin: ["Admin", "Administration"],
  Procurement: ["Procurement", "Purchase", "Sourcing"],
  Facilities: ["Facilities", "Facility"],
  Marketing: ["Marketing"],
  Operations: ["Operations"],
  Leadership: ["CEO", "MD", "Managing Director", "COO", "CXO"],
};

const JUNIOR_ONLY =
  /\b(junior|intern|trainee|entry[- ]level|graduate)\b/i;
const SENIOR_ANCHOR =
  /\b(director|vp|vice president|head|manager|chief|founder|president|chro|cpo|ceo|coo|cfo)\b/i;
const JUNIOR_ROLE = /\b(associate|assistant)\b/i;

export function isNonSeniorTitle(title: string): boolean {
  if (JUNIOR_ONLY.test(title)) return true;
  if (SENIOR_ANCHOR.test(title)) return false;
  return JUNIOR_ROLE.test(title);
}

export function buildRoleTitleHints(seniority: string[], departments: string[]): string[] {
  const hints: string[] = [];
  const seen = new Set<string>();
  const add = (term: string) => {
    const key = term.toLowerCase();
    if (!term || seen.has(key)) return;
    seen.add(key);
    hints.push(term);
  };
  // Department keywords first so LinkedIn queries are not all generic seniority.
  for (const d of departments) {
    for (const t of DEPARTMENT_TITLES[d] ?? []) add(t);
  }
  for (const s of seniority) {
    for (const t of SENIORITY_TITLES[s] ?? []) add(t);
  }
  return hints;
}

function titleOrSeniorityMatches(person: ScoutPersonResult, labels: string[], catalog: Record<string, string[]>): boolean {
  const titleLower = (person.title ?? "").toLowerCase();
  const senLower = (person.seniority ?? "").toLowerCase();
  const deptLower = (person.department ?? "").toLowerCase();
  if (!titleLower && !senLower && !deptLower) return true;
  return labels.some((label) => {
    const keywords = catalog[label] ?? [label];
    return keywords.some(
      (k) =>
        titleLower.includes(k.toLowerCase()) ||
        senLower.includes(k.toLowerCase()) ||
        deptLower.includes(k.toLowerCase()),
    );
  });
}

export function personMatchesRoles(
  person: ScoutPersonResult,
  seniority: string[],
  departments: string[],
  requireBoth = true,
): boolean {
  if (!seniority.length && !departments.length) return true;
  const titleLower = (person.title ?? "").toLowerCase();
  if (seniority.length > 0 && titleLower && isNonSeniorTitle(titleLower)) return false;

  const senMatch = seniority.length === 0 || titleOrSeniorityMatches(person, seniority, SENIORITY_TITLES);
  const deptMatch = departments.length === 0 || titleOrSeniorityMatches(person, departments, DEPARTMENT_TITLES);

  if (seniority.length > 0 && departments.length > 0) {
    return requireBoth ? senMatch && deptMatch : senMatch || deptMatch;
  }
  return senMatch || deptMatch;
}

/** Prefer strict role matches; fall back to OR, then untitled LinkedIn, then unfiltered. */
export function filterPeopleByRoles(
  people: ScoutPersonResult[],
  seniority: string[],
  departments: string[],
): { people: ScoutPersonResult[]; relaxed: "or" | "untitled" | "unfiltered" | null } {
  if (!seniority.length && !departments.length) return { people, relaxed: null };

  const strict = people.filter((p) => personMatchesRoles(p, seniority, departments, true));
  if (strict.length) return { people: strict, relaxed: null };

  if (seniority.length > 0 && departments.length > 0) {
    const loose = people.filter((p) => personMatchesRoles(p, seniority, departments, false));
    if (loose.length) return { people: loose, relaxed: "or" };
  }

  const untitled = people.filter((p) => !(p.title ?? "").trim() && p.linkedIn);
  if (untitled.length) return { people: untitled, relaxed: "untitled" };

  return { people, relaxed: "unfiltered" };
}

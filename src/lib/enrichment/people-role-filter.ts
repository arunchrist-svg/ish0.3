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

const OFF_DEPT_TITLE =
  /\b(sales|business development|bde|bdr|sdr|account executive|software|labeling|labelling|engineer|engineering|developer|qa|quality assurance)\b/i;

const BUYING_DEPTS = new Set(["HR", "Admin", "Procurement", "Facilities"]);

export function buildRoleTitleHints(seniority: string[], departments: string[]): string[] {
  const hints = new Set<string>();
  for (const s of seniority) {
    for (const t of SENIORITY_TITLES[s] ?? []) hints.add(t);
  }
  for (const d of departments) {
    for (const t of DEPARTMENT_TITLES[d] ?? []) hints.add(t);
  }
  return [...hints];
}

const NON_SENIOR_TITLE_PATTERNS = [
  /\bjunior\b/i,
  /\bintern\b/i,
  /\btrainee\b/i,
  /\bassociate\b/i,
  /\bentry[- ]level\b/i,
  /\bgraduate\b/i,
  /\bassistant\b/i,
];

export function isNonSeniorTitle(title: string): boolean {
  return NON_SENIOR_TITLE_PATTERNS.some((re) => re.test(title));
}

function isOffDepartmentTitle(title: string, departments: string[]): boolean {
  if (!departments.some((d) => BUYING_DEPTS.has(d))) return false;
  if (departments.includes("Marketing") && /\bsales\b/i.test(title)) return false;
  if (departments.includes("Operations") && /\bengineer/i.test(title)) return false;
  return OFF_DEPT_TITLE.test(title);
}

export function personMatchesRoles(person: ScoutPersonResult, seniority: string[], departments: string[]): boolean {
  if (!seniority.length && !departments.length) return true;
  const titleLower = (person.title ?? "").toLowerCase();
  if (seniority.length > 0 && titleLower && isNonSeniorTitle(titleLower)) return false;
  if (titleLower && isOffDepartmentTitle(titleLower, departments)) return false;
  const senLower = (person.seniority ?? "").toLowerCase();
  const deptLower = (person.department ?? "").toLowerCase();

  const senMatch =
    seniority.length === 0 ||
    seniority.some((s) => {
      const keywords = SENIORITY_TITLES[s] ?? [s];
      return keywords.some((k) => titleLower.includes(k.toLowerCase()) || senLower.includes(k.toLowerCase()));
    });

  const deptMatch =
    departments.length === 0 ||
    departments.some((d) => {
      const keywords = DEPARTMENT_TITLES[d] ?? [d];
      return keywords.some((k) => titleLower.includes(k.toLowerCase()) || deptLower.includes(k.toLowerCase()));
    });

  if (seniority.length > 0 && departments.length > 0) return senMatch && deptMatch;
  if (seniority.length > 0) return senMatch;
  return deptMatch;
}

export function filterPeopleByRoles(
  people: ScoutPersonResult[],
  seniority: string[],
  departments: string[],
): { people: ScoutPersonResult[]; relaxed: boolean } {
  if (!seniority.length && !departments.length) return { people, relaxed: false };

  const strict = people.filter((p) => personMatchesRoles(p, seniority, departments));
  if (strict.length > 0 || seniority.length === 0 || departments.length === 0) {
    return { people: strict, relaxed: false };
  }

  // Both filters set but nobody hit AND: keep department matches first (still drop
  // juniors / off-dept), then seniority-only, so scout is not empty on close misses.
  const deptOnly = people.filter((p) => {
    if (isNonSeniorTitle(p.title ?? "")) return false;
    if (isOffDepartmentTitle(p.title ?? "", departments)) return false;
    return personMatchesRoles(p, [], departments);
  });
  if (deptOnly.length > 0) return { people: deptOnly, relaxed: true };

  const senOnly = people.filter((p) => {
    if (isOffDepartmentTitle(p.title ?? "", departments)) return false;
    return personMatchesRoles(p, seniority, []);
  });
  if (senOnly.length > 0) return { people: senOnly, relaxed: true };

  return { people: [], relaxed: false };
}

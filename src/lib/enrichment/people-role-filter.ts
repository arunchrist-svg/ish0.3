import type { ScoutPersonResult } from "./types";
import { personLooksOpenToWork } from "@/lib/enrichment/person-company-match";
import { hasPlantCitySelection, selectionLooksLikeNeighborhoods } from "./city-search";

export const SENIORITY_TITLES: Record<string, string[]> = {
  "C-Level": ["CEO", "COO", "CHRO", "CPO", "CXO", "Chief", "MD", "Managing Director", "President"],
  Founders: ["Founder", "Co-Founder", "Co-founder", "Founding"],
  VP: ["VP", "Vice President"],
  Director: ["Director", "Head"],
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

const GIFTING_SEARCH_TITLES: Record<string, string[]> = {
  HR: ["HR Director", "Head of HR", "HR Manager", "Plant HR", "CHRO", "People Manager"],
  Procurement: ["Procurement Head", "Head of Procurement", "Procurement Manager", "Sourcing Head", "Purchase Manager"],
  Admin: ["Admin Head", "Head of Admin", "Admin Manager"],
  Facilities: ["Facilities Head", "Head of Facilities", "Facilities Manager"],
};

/** Local senior operators at banks, schools, hospitals, and similar establishments. */
export const BUSINESS_ROLE_WATERFALL: Record<string, string[]> = {
  Banks: ["Branch Manager", "Chief Manager", "Cluster Head", "Manager"],
  Schools: ["Principal", "Vice Principal", "Correspondent", "Administrator"],
  Colleges: ["Principal", "Registrar", "Dean", "Administrator"],
  Universities: ["Principal", "Registrar", "Dean", "Administrator"],
  Hospitals: ["Medical Superintendent", "Hospital Administrator", "Unit Head", "Manager"],
  Hotels: ["General Manager", "Front Office Manager", "Unit Manager"],
  Hostels: ["General Manager", "Front Office Manager", "Unit Manager"],
  "Government offices": ["Branch Head", "Administrative Officer", "Manager"],
  Clubs: ["Secretary", "Manager", "President", "Admin"],
  "Housing societies": ["Secretary", "Manager", "President", "Admin"],
};

export const BUSINESS_FALLBACK_TITLES = ["Branch Manager", "Principal", "General Manager", "Manager"];

export type PeopleRoleSearchKind = "industry" | "business";

export type PeopleRoleFilterOpts = {
  searchKind?: PeopleRoleSearchKind;
  businesses?: string[];
  /** Honor user seniority/department chips; no waterfall or soft broaden. */
  strict?: boolean;
};

export function isBusinessPeopleSearch(opts?: PeopleRoleFilterOpts | null): boolean {
  return opts?.searchKind === "business";
}

function roundRobinTitleStacks(stacks: string[][], max = 10): string[] {
  const hints: string[] = [];
  const seen = new Set<string>();
  const maxLen = Math.max(0, ...stacks.map((s) => s.length));
  for (let i = 0; i < maxLen; i++) {
    for (const stack of stacks) {
      const term = stack[i];
      if (!term || seen.has(term.toLowerCase())) continue;
      seen.add(term.toLowerCase());
      hints.push(term);
    }
  }
  return hints.slice(0, max);
}

export function businessRoleStacks(businesses?: string[]): string[][] {
  const labels = (businesses ?? []).filter((label) => BUSINESS_ROLE_WATERFALL[label]);
  const stacks = (labels.length ? labels : Object.keys(BUSINESS_ROLE_WATERFALL)).map(
    (label) => BUSINESS_ROLE_WATERFALL[label] ?? BUSINESS_FALLBACK_TITLES,
  );
  return stacks.length ? stacks : [BUSINESS_FALLBACK_TITLES];
}

export function buildBusinessRoleTitleHints(businesses?: string[]): string[] {
  const hints = roundRobinTitleStacks(businessRoleStacks(businesses));
  for (const fallback of BUSINESS_FALLBACK_TITLES) {
    if (hints.length >= 10) break;
    if (!hints.some((h) => h.toLowerCase() === fallback.toLowerCase())) hints.push(fallback);
  }
  return hints.slice(0, 10);
}

function titleLooksLocalBranch(title: string): boolean {
  return /\b(branch|unit|campus|cluster|school|hospital|hotel|hostel|ward|front office|local)\b/i.test(title);
}

/** Corporate HQ people we skip for neighborhood businesses unless the title is clearly on-site. */
export function isCorporateHqPeopleTitle(title: string | null | undefined): boolean {
  if (!title?.trim()) return false;
  if (titleLooksLocalBranch(title)) return false;
  return /\b(chro|cpo|head of hr|hr director|chief human|head of procurement|procurement director|chief procurement)\b/i.test(
    title,
  );
}

export function titleMatchesBusinessRole(title: string | null | undefined, role: string): boolean {
  if (!title?.trim() || !role.trim()) return false;
  const hay = title.toLowerCase();
  const needle = role.toLowerCase();
  if (needle === "principal") {
    return /\bprincipal\b/i.test(hay) && !/\bvice\s+principal\b/i.test(hay);
  }
  if (needle === "manager") {
    return /\bmanagers?\b/i.test(hay);
  }
  if (needle === "admin") {
    return /\b(admin|administrator|administration)\b/i.test(hay);
  }
  return hay.includes(needle);
}

/**
 * True when the title is a buyer-dept role (HR/People/CHRO/Procurement/Purchase/Sourcing/Admin/Facilities)
 * at Manager level or above. Used to gate festival-sweets leads.
 */
export function isFestivalBuyerRole(title: string | null | undefined): boolean {
  if (!title?.trim()) return false;
  const t = title.toLowerCase();
  if (isTeamLeadTitle(t) || isNonSeniorTitle(t)) return false;
  const buyerDept =
    /\b(hr|human resources|people|chro|cpo|procurement|purchase|purchasing|sourcing|admin|administration|facilities|facility|payroll)\b/i.test(t);
  if (!buyerDept) return false;
  // Accept C-level buyer-dept acronyms by themselves (CHRO, CPO are inherently senior).
  if (/\b(chro|cpo)\b/i.test(t)) return true;
  // Plant HR is a buyer even without "Manager" in the title.
  if (/\bplant\b/i.test(t) && /\b(hr|human resources|people)\b/i.test(t)) return true;
  // "HR Executive" / "Procurement Officer" are common SME titles in India where that person IS the DM.
  return /\b(manager|head|director|vp|vice president|chief|ceo|coo|cfo|cxo|md|managing director|president|founder|payroll|executive|officer)\b/i.test(
    t,
  );
}

/** Director / HR / Procurement fetch uses a seniority waterfall, not stacked AND. */
export function usesBuyerDmWaterfall(
  seniority: string[],
  departments: string[],
  opts?: PeopleRoleFilterOpts,
): boolean {
  if (opts?.strict) return false;
  if (isBusinessPeopleSearch(opts)) return false;
  if (seniority.includes("Manager") && !seniority.includes("Director")) return false;
  return (
    seniority.includes("Director") ||
    departments.includes("HR") ||
    departments.includes("Procurement") ||
    (seniority.length === 0 && departments.length === 0)
  );
}

/** LinkedIn OR terms: round-robin so HR does not crowd out Procurement. */
export function buildRoleTitleHints(
  seniority: string[],
  departments: string[],
  opts?: PeopleRoleFilterOpts,
): string[] {
  if (isBusinessPeopleSearch(opts)) {
    return buildBusinessRoleTitleHints(opts?.businesses);
  }
  if (opts?.strict) {
    const stacks: string[][] = [];
    for (const d of departments) {
      stacks.push((DEPARTMENT_TITLES[d] ?? [d]).slice(0, 4));
    }
    if (seniority.length) {
      stacks.push(seniority.flatMap((s) => SENIORITY_TITLES[s] ?? [s]).slice(0, 4));
    }
    return roundRobinTitleStacks(stacks);
  }
  const stacks: string[][] = [];
  for (const d of departments) {
    stacks.push(GIFTING_SEARCH_TITLES[d] ?? (DEPARTMENT_TITLES[d] ?? [d]).slice(0, 2));
  }
  if (usesBuyerDmWaterfall(seniority, departments, opts)) {
    // For buyer-dept scouts, only search within buyer departments.
    // Do NOT add Director/VP/CEO/Head without a dept qualifier — that pulls Finance Directors and CTOs.
    if (!departments.length) {
      stacks.push(["HR Director", "Head of HR", "HR Manager", "Procurement Head", "Procurement Manager", "CHRO"]);
    }
    // (dept stacks already added above)
  } else if (seniority.length && !departments.length) {
    stacks.push(seniority.flatMap((s) => SENIORITY_TITLES[s] ?? [s]).slice(0, 4));
  }
  return roundRobinTitleStacks(stacks);
}

/** Fill department and seniority chips from a job title when providers omit those fields. */
export function inferRoleFromTitle(title?: string | null): { department?: string; seniority?: string } {
  if (!title?.trim()) return {};
  const t = title.toLowerCase();
  let department: string | undefined;
  for (const [dept, keywords] of Object.entries(DEPARTMENT_TITLES)) {
    if (keywords.some((k) => t.includes(k.toLowerCase()))) {
      department = dept;
      break;
    }
  }
  let seniority: string | undefined;
  if (
    /\b(ceo|cfo|cto|chro|cpo|coo|cxo|chief|founder|co-founder|managing director)\b/i.test(title) ||
    /\bmd\b/i.test(title)
  ) {
    seniority = "C-Level";
  } else if (/\b(vp|vice president)\b/i.test(title)) {
    seniority = "VP";
  } else if (/\bdirector\b/i.test(title)) {
    seniority = "Director";
  } else if (/\bhead of\b/i.test(title) || /\bhead\b/i.test(title)) {
    seniority = "Head";
  } else if (/\bmanager\b/i.test(title)) {
    seniority = "Manager";
  }
  return { department, seniority };
}

const NON_SENIOR_TITLE_PATTERNS = [
  /\bjunior\b/i,
  /\bintern\b/i,
  /\btrainee\b/i,
  /\bassociate\b/i,
  /\bentry[- ]level\b/i,
  /\bgraduate\b/i,
  /\bassistant\b/i,
  /\bteam[- ]?leads?\b/i,
  /\bteam[- ]?leaders?\b/i,
  /\b(tech|module|squad|pod|shift)[- ]?leads?\b/i,
];

export function isTeamLeadTitle(title: string): boolean {
  return (
    /\bteam[- ]?leads?\b/i.test(title) ||
    /\bteam[- ]?leaders?\b/i.test(title) ||
    /\b(tech|module|squad|pod|shift)[- ]?leads?\b/i.test(title)
  );
}

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
  const titleLower = (person.title ?? "").toLowerCase();
  if (titleLower && isTeamLeadTitle(titleLower)) return false;
  if (!seniority.length && !departments.length) return true;
  const buyingDeptFilter = departments.some((d) => BUYING_DEPTS.has(d));
  if ((seniority.length > 0 || buyingDeptFilter) && titleLower && isNonSeniorTitle(titleLower)) {
    return false;
  }
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

export type PeopleFetchRisk = {
  needsConfirm: boolean;
  stacked: boolean;
  headline: string;
  costLine: string;
  emptyRiskLine: string | null;
  suggestionLine: string | null;
  suggestedFilters: {
    seniority: string[];
    departments: string[];
  } | null;
};

const PLANT_CITY_BUYER_DEPTS = ["HR", "Procurement"] as const;
const PLANT_CITY_PUBLIC_DEPTS = new Set([...PLANT_CITY_BUYER_DEPTS, "Admin", "Facilities", "Marketing"]);

function isPlantCityLikelyZeroRisk(
  cities: string[],
  seniority: string[],
  departments: string[],
  locationScope?: "focus" | "interest",
): boolean {
  // Focus Area / neighborhood chips are not plant towns. Skip this gate.
  if (locationScope === "focus") return false;
  if (selectionLooksLikeNeighborhoods(cities)) return false;
  if (!hasPlantCitySelection(cities)) return false;
  if (!seniority.length || !departments.length) return false;
  const hasUpperExec = seniority.includes("VP") || seniority.includes("C-Level");
  if (!hasUpperExec) return false;
  const publicDeptCount = departments.filter((dept) => PLANT_CITY_PUBLIC_DEPTS.has(dept)).length;
  return publicDeptCount >= 2;
}

function suggestedPlantCityFilters(
  departments: string[],
): { seniority: string[]; departments: string[] } | null {
  const buyerDepts = PLANT_CITY_BUYER_DEPTS.filter((dept) => departments.includes(dept));
  if (!buyerDepts.length) return null;
  return {
    seniority: ["Manager", "Director"],
    departments: buyerDepts,
  };
}

export function peopleAndFilterWarning(
  seniority: string[],
  departments: string[],
  cities: string[] = [],
  opts?: PeopleRoleFilterOpts,
  locationScope?: "focus" | "interest",
): string | null {
  if (opts?.strict) return null;
  if (isBusinessPeopleSearch(opts)) return null;
  if (!seniority.length || !departments.length) return null;
  if (isPlantCityLikelyZeroRisk(cities, seniority, departments, locationScope)) {
    return "In towns like Hosur or Ramanagara, LinkedIn usually lists Manager or Director, not VP. Tight People filters often return 0 leads, and you still spend one credit per company.";
  }
  if (usesBuyerDmWaterfall(seniority, departments, opts)) return null;
  return "A contact must match seniority AND department. Stacking both often returns 0 people, and Fetch Leads still spends one search credit per company.";
}

export function assessPeopleFetchRisk(input: {
  companyCount: number;
  cities?: string[];
  seniority: string[];
  departments: string[];
  searchKind?: PeopleRoleSearchKind;
  businesses?: string[];
  locationScope?: "focus" | "interest";
  strict?: boolean;
}): PeopleFetchRisk {
  const { companyCount, cities = [], seniority, departments, locationScope } = input;
  const roleOpts: PeopleRoleFilterOpts = {
    searchKind: input.searchKind,
    businesses: input.businesses,
    strict: input.strict,
  };
  const both = seniority.length > 0 && departments.length > 0;
  const stacked = both && seniority.length + departments.length >= 4;
  const costLine =
    companyCount === 1
      ? "This uses 1 people search credit."
      : `This uses ${companyCount} people search credits, one per company. Credits are spent even if nobody matches.`;

  if (input.strict) {
    return {
      needsConfirm: false,
      stacked: false,
      headline: "",
      costLine,
      emptyRiskLine: null,
      suggestionLine: null,
      suggestedFilters: null,
    };
  }

  if (isBusinessPeopleSearch(roleOpts)) {
    return {
      needsConfirm: false,
      stacked: false,
      headline: "",
      costLine,
      emptyRiskLine: null,
      suggestionLine: null,
      suggestedFilters: null,
    };
  }

  if (isPlantCityLikelyZeroRisk(cities, seniority, departments, locationScope)) {
    const suggestedFilters = suggestedPlantCityFilters(departments);
    return {
      needsConfirm: true,
      stacked: true,
      headline: "These People filters may return 0 leads",
      costLine,
      emptyRiskLine: peopleAndFilterWarning(seniority, departments, cities, roleOpts, locationScope),
      suggestionLine: suggestedFilters
        ? `Try this instead: ${suggestedFilters.seniority.join(" + ")} with ${suggestedFilters.departments.join(" + ")}.`
        : null,
      suggestedFilters,
    };
  }

  if (!both || usesBuyerDmWaterfall(seniority, departments, roleOpts)) {
    return {
      needsConfirm: false,
      stacked: false,
      headline: "",
      costLine,
      emptyRiskLine: null,
      suggestionLine: null,
      suggestedFilters: null,
    };
  }

  return {
    needsConfirm: true,
    stacked,
    headline: stacked
      ? "These People filters often return 0 leads"
      : "People filters require both seniority and department",
    costLine,
    emptyRiskLine: peopleAndFilterWarning(seniority, departments, cities, roleOpts, locationScope),
    suggestionLine: null,
    suggestedFilters: null,
  };
}

function isDroppedScoutPerson(person: ScoutPersonResult): boolean {
  return isTeamLeadTitle(`${person.title ?? ""}\n${person.bio ?? ""}`) || personLooksOpenToWork(person);
}

function selectPeopleByBusinessWaterfall(
  people: ScoutPersonResult[],
  businesses?: string[],
): { people: ScoutPersonResult[]; relaxed: boolean } {
  const eligible = people.filter((p) => !isCorporateHqPeopleTitle(p.title));
  const stacks = businessRoleStacks(businesses);
  const maxLen = Math.max(0, ...stacks.map((s) => s.length));
  for (let i = 0; i < maxLen; i++) {
    const terms = [...new Set(stacks.map((stack) => stack[i]).filter((term): term is string => Boolean(term)))];
    const hit = eligible.filter((p) => terms.some((term) => titleMatchesBusinessRole(p.title, term)));
    if (hit.length) return { people: hit, relaxed: i > 0 };
  }
  const fallback = eligible.filter((p) =>
    BUSINESS_FALLBACK_TITLES.some((term) => titleMatchesBusinessRole(p.title, term)),
  );
  if (fallback.length) return { people: fallback, relaxed: true };
  return { people: [], relaxed: false };
}

function selectPeopleByDmWaterfall(
  people: ScoutPersonResult[],
): { people: ScoutPersonResult[]; relaxed: boolean } {
  // Stage 1: HR Director or Procurement Director — best match.
  const stage1 = people.filter(
    (p) =>
      personMatchesRoles(p, ["Director"], ["HR"]) ||
      personMatchesRoles(p, ["Director"], ["Procurement"]),
  );
  if (stage1.length) return { people: stage1, relaxed: false };

  // Stage 2: Any buyer-dept Manager+ (HR Manager, Plant HR, Procurement Manager, Admin Head, etc.)
  // This is a valid relaxation — Plant HR Manager decides on gifting at the plant.
  const stage2 = people.filter(
    (p) =>
      isFestivalBuyerRole(p.title) &&
      (personMatchesRoles(p, [], ["HR"]) ||
        personMatchesRoles(p, [], ["Procurement"]) ||
        personMatchesRoles(p, [], ["Admin"]) ||
        personMatchesRoles(p, [], ["Facilities"])),
  );
  if (stage2.length) return { people: stage2, relaxed: true };

  // Stage 3: Senior buyer-dept leaders (VP HR, CHRO, CPO) — still buyer dept, higher seniority.
  const stage3 = people.filter(
    (p) =>
      isFestivalBuyerRole(p.title) &&
      (personMatchesRoles(p, ["VP", "C-Level"], ["HR"]) ||
        personMatchesRoles(p, ["VP", "C-Level"], ["Procurement"])),
  );
  if (stage3.length) return { people: stage3, relaxed: true };

  // Stage 4: Any festival buyer role regardless of inferred department — catches Admin Manager,
  // Facilities Manager, and HR roles where the provider did not populate the department field.
  // Finance Directors, CTOs, and CEOs still fail isFestivalBuyerRole, so they are NOT accepted.
  const stage4 = people.filter((p) => isFestivalBuyerRole(p.title));
  if (stage4.length) return { people: stage4, relaxed: true };

  // No valid buyer-dept person found — return empty. Do NOT substitute Finance Directors or CTOs.
  return { people: [], relaxed: false };
}

export function filterPeopleByRoles(
  people: ScoutPersonResult[],
  seniority: string[],
  departments: string[],
  opts?: PeopleRoleFilterOpts,
): { people: ScoutPersonResult[]; relaxed: boolean } {
  people = people.filter((p) => !isDroppedScoutPerson(p));
  if (isBusinessPeopleSearch(opts)) {
    return selectPeopleByBusinessWaterfall(people, opts?.businesses);
  }
  if (opts?.strict) {
    if (!seniority.length && !departments.length) return { people, relaxed: false };
    return {
      people: people.filter((p) => personMatchesRoles(p, seniority, departments)),
      relaxed: false,
    };
  }
  if (usesBuyerDmWaterfall(seniority, departments, opts)) {
    return selectPeopleByDmWaterfall(people);
  }
  if (!seniority.length && !departments.length) return { people, relaxed: false };

  const strict = people.filter((p) => personMatchesRoles(p, seniority, departments));
  if (strict.length > 0) return { people: strict, relaxed: false };

  if (seniority.length > 0 && departments.length > 0) {
    const deptOnly = people.filter((p) => {
      if (isNonSeniorTitle(p.title ?? "")) return false;
      if (isOffDepartmentTitle(p.title ?? "", departments)) return false;
      return personMatchesRoles(p, [], departments);
    });
    if (deptOnly.length > 0) return { people: deptOnly, relaxed: true };

    const senOnly = people.filter((p) => {
      if (isOffDepartmentTitle(p.title ?? "", departments)) return false;
      if (departments.some((d) => BUYING_DEPTS.has(d)) && !isFestivalBuyerRole(p.title)) return false;
      return personMatchesRoles(p, seniority, []);
    });
    if (senOnly.length > 0) return { people: senOnly, relaxed: true };
  }

  const untitled = people.filter((p) => !(p.title ?? "").trim());
  if (untitled.length > 0) return { people: untitled, relaxed: true };

  return { people: [], relaxed: false };
}

import { expandPeopleFiltersForOffer, type PlatformIntent } from "@/lib/brand/platform-intent";
import { includeHqCorridorForScoutPeople, nearbyLabelsForScoutCities, selectPeopleForLeadLocation } from "./city-search";
import { indiaDirectoriesSearchPeople } from "./india-directories";
import { buildRoleTitleHints, filterPeopleByRoles, personMatchesRoles } from "./people-role-filter";
import type { ScoutCompanyResult, ScoutPersonResult } from "./types";
import { corridorOnlyLabels, isPlantSeatScout, selectPeoplePlantThenCorridor } from "@/lib/scout/plant-seat";

export type LeadabilityBand = "high" | "medium" | "low" | "unknown";

export type LeadabilityAssessment = {
  leadabilityScore: number;
  leadabilityBand: LeadabilityBand;
  leadabilityMatchedPeople: number;
  leadabilityMatchedInCity: number;
  leadabilityProbeSource?: string;
};

const UNKNOWN_LEADABILITY: LeadabilityAssessment = {
  leadabilityScore: 0,
  leadabilityBand: "unknown",
  leadabilityMatchedPeople: 0,
  leadabilityMatchedInCity: 0,
};

function bandForScore(score: number): LeadabilityBand {
  if (score >= 80) return "high";
  if (score >= 45) return "medium";
  return "low";
}

export function assessLeadabilityFromPeople(params: {
  people: ScoutPersonResult[];
  seniority: string[];
  departments: string[];
  cities: string[];
  indiaOnly?: boolean;
  searchKind?: "industry" | "business";
  businesses?: string[];
  locationScope?: "focus" | "interest";
}): LeadabilityAssessment {
  const { people, seniority, departments, cities, indiaOnly, searchKind, businesses } = params;
  const roleOpts = { searchKind, businesses };
  const plantSeat = isPlantSeatScout(cities) && searchKind !== "business";
  const includeHqCorridor = includeHqCorridorForScoutPeople({
    cities,
    locationScope: params.locationScope,
    localOperators: searchKind === "business",
  });
  if (!people.length) return { ...UNKNOWN_LEADABILITY, leadabilityBand: "low" };

  const exactRoleMatches =
    searchKind === "business"
      ? filterPeopleByRoles(people, seniority, departments, roleOpts).people
      : seniority.length > 0 || departments.length > 0
        ? people.filter((person) => personMatchesRoles(person, seniority, departments))
        : filterPeopleByRoles(people, seniority, departments, roleOpts).people;

  const exactCityMatches = (() => {
    if (!(indiaOnly || cities.length)) return exactRoleMatches;
    if (plantSeat) {
      return selectPeoplePlantThenCorridor(exactRoleMatches, cities).people;
    }
    return selectPeopleForLeadLocation(exactRoleMatches, cities, { indiaOnly, includeHqCorridor }).people;
  })();

  if (exactCityMatches.length >= 2) {
    return {
      leadabilityScore: 96,
      leadabilityBand: "high",
      leadabilityMatchedPeople: exactRoleMatches.length,
      leadabilityMatchedInCity: exactCityMatches.length,
    };
  }
  if (exactCityMatches.length === 1) {
    return {
      leadabilityScore: 84,
      leadabilityBand: "high",
      leadabilityMatchedPeople: exactRoleMatches.length,
      leadabilityMatchedInCity: 1,
    };
  }
  if (exactRoleMatches.length > 0) {
    return {
      leadabilityScore: 52,
      leadabilityBand: "medium",
      leadabilityMatchedPeople: exactRoleMatches.length,
      leadabilityMatchedInCity: 0,
    };
  }

  const relaxedRoles = filterPeopleByRoles(people, seniority, departments, roleOpts).people;
  const relaxedCityMatches = (() => {
    if (!(indiaOnly || cities.length)) return relaxedRoles;
    if (plantSeat) {
      return selectPeoplePlantThenCorridor(relaxedRoles, cities).people;
    }
    return selectPeopleForLeadLocation(relaxedRoles, cities, { indiaOnly, includeHqCorridor }).people;
  })();
  const relaxedCount = relaxedCityMatches.length || relaxedRoles.length;
  if (relaxedCount > 0) {
    const score = cities.length && relaxedCityMatches.length === 0 ? 18 : 28;
    return {
      leadabilityScore: score,
      leadabilityBand: bandForScore(score),
      leadabilityMatchedPeople: relaxedRoles.length,
      leadabilityMatchedInCity: relaxedCityMatches.length,
    };
  }

  return { ...UNKNOWN_LEADABILITY, leadabilityBand: "low" };
}

export async function probeCompanyLeadability(params: {
  company: ScoutCompanyResult;
  seniority: string[];
  departments: string[];
  cities: string[];
  platformIntent?: PlatformIntent | null;
  treatAsGifting?: boolean;
  searchKind?: "industry" | "business";
  businesses?: string[];
  locationScope?: "focus" | "interest";
  limit?: number;
  searchPeople?: (input: {
    companyName: string;
    companyDomain?: string;
    limit?: number;
    roleHints?: string[];
    cities?: string[];
    indiaOnly?: boolean;
    localOperators?: boolean;
    locationScope?: "focus" | "interest";
    plantSeatPhase?: "plant" | "hq_corridor";
  }) => Promise<ScoutPersonResult[]>;
}): Promise<LeadabilityAssessment> {
  const {
    company,
    seniority,
    departments,
    cities,
    platformIntent,
    treatAsGifting,
    searchKind,
    businesses,
    locationScope,
    limit = 4,
    searchPeople = indiaDirectoriesSearchPeople,
  } = params;
  const active = expandPeopleFiltersForOffer(platformIntent, seniority, departments, {
    treatAsGifting,
    searchKind,
    businesses,
  });
  const roleOpts = { searchKind, businesses };
  const roleHints = buildRoleTitleHints(active.seniority, active.departments, roleOpts);
  const plantSeat = isPlantSeatScout(cities) && searchKind !== "business";
  const includeHqCorridor = includeHqCorridorForScoutPeople({
    cities,
    locationScope,
    localOperators: searchKind === "business",
  });

  let people: ScoutPersonResult[] = [];
  let probeSource = "india_directories";

  if (plantSeat && cities.length) {
    // Stage A: plant city only. Stage B only if plant empty.
    people = await searchPeople({
      companyName: company.name,
      companyDomain: company.domain,
      limit,
      roleHints: roleHints.length ? roleHints : undefined,
      cities,
      localOperators: false,
      locationScope,
      plantSeatPhase: "plant",
    });
    const plantSeated = selectPeoplePlantThenCorridor(people, cities);
    if (plantSeated.people.length === 0) {
      const corridor = corridorOnlyLabels(cities);
      if (corridor.length) {
        const hqPeople = await searchPeople({
          companyName: company.name,
          companyDomain: company.domain,
          limit,
          roleHints: roleHints.length ? roleHints : undefined,
          cities: corridor,
          localOperators: false,
          locationScope,
          plantSeatPhase: "hq_corridor",
        });
        people = [...people, ...hqPeople];
      }
    }
    probeSource = people[0]?.dataSource ?? "india_directories";
  } else {
    const probeCities = includeHqCorridor && cities.length ? nearbyLabelsForScoutCities(cities) : cities;
    people = await searchPeople({
      companyName: company.name,
      companyDomain: company.domain,
      limit,
      roleHints: roleHints.length ? roleHints : undefined,
      cities: probeCities.length ? probeCities : undefined,
      localOperators: searchKind === "business",
      locationScope,
    });
    probeSource = people[0]?.dataSource ?? "india_directories";
  }

  return {
    ...assessLeadabilityFromPeople({
      people,
      seniority: active.seniority,
      departments: active.departments,
      cities,
      searchKind,
      businesses,
      locationScope,
    }),
    leadabilityProbeSource: probeSource,
  };
}

export function applyLeadability(
  company: ScoutCompanyResult,
  leadability: LeadabilityAssessment,
): ScoutCompanyResult {
  const reason =
    company.fitScoreReason ||
    (leadability.leadabilityMatchedInCity > 0
      ? "Plant or nearby HQ buyers found on LinkedIn"
      : leadability.leadabilityBand === "low"
        ? "No plant or nearby HQ buyers found yet"
        : undefined);
  return {
    ...company,
    ...leadability,
    ...(reason ? { fitScoreReason: reason } : {}),
  };
}

export function sortCompaniesByLeadability(companies: ScoutCompanyResult[]): ScoutCompanyResult[] {
  return [...companies].sort((a, b) => {
    const leadabilityDelta = (b.leadabilityScore ?? 0) - (a.leadabilityScore ?? 0);
    if (leadabilityDelta !== 0) return leadabilityDelta;
    return (b.fitScore ?? 0) - (a.fitScore ?? 0);
  });
}

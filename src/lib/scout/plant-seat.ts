/**
 * Plant-first seat policy: keep people in the plant city first.
 * Only after the plant is empty, keep nearby HQ corridor (Bengaluru for Ramanagara).
 * Never Delhi / Mumbai / NYC.
 */
import {
  hasPlantCitySelection,
  nearbyLabelsForScoutCities,
  personLocationMatchesSelection,
  selectPeopleForScoutCities,
  selectionLooksLikeNeighborhoods,
} from "@/lib/enrichment/city-search";
import type { ScoutPersonResult } from "@/lib/enrichment/types";

export type PlantSeat = "plant" | "nearby_hq";

export type SeatedPerson = ScoutPersonResult & {
  seat?: PlantSeat;
};

export function isPlantSeatScout(cities: string[]): boolean {
  return hasPlantCitySelection(cities) && !selectionLooksLikeNeighborhoods(cities);
}

/** Corridor labels that are not the plant chip itself (e.g. Bengaluru for Ramanagara). */
export function corridorOnlyLabels(plantCities: string[]): string[] {
  const plant = new Set(plantCities.map((c) => c.trim().toLowerCase()).filter(Boolean));
  return nearbyLabelsForScoutCities(plantCities).filter((label) => !plant.has(label.trim().toLowerCase()));
}

export function plantSeatReason(seat: PlantSeat, corridorLabels: string[]): string {
  if (seat === "plant") return "Plant city";
  const metro = corridorLabels[0] ?? "nearby HQ";
  return `Nearby HQ: ${metro} (plant had no public LinkedIn)`;
}

/**
 * Two-stage keep for plant-town scouts.
 * Stage A: plant city only. Stage B (if A empty): plant + corridor HQ.
 */
export function selectPeoplePlantThenCorridor<T extends { location?: string | null; matchScore?: number }>(
  people: T[],
  plantCities: string[],
): {
  people: Array<T & { seat: PlantSeat; matchScoreReason?: string }>;
  usedHqFallback: boolean;
  corridorLabels: string[];
} {
  const corridorLabels = corridorOnlyLabels(plantCities);
  const plantOnly = selectPeopleForScoutCities(people, plantCities, { includeHqCorridor: false });

  if (plantOnly.people.length > 0) {
    return {
      people: plantOnly.people.map((person) => ({
        ...person,
        seat: "plant" as const,
        matchScoreReason: plantSeatReason("plant", corridorLabels),
      })),
      usedHqFallback: false,
      corridorLabels,
    };
  }

  const withCorridor = selectPeopleForScoutCities(people, plantCities, { includeHqCorridor: true });
  const hqPeople = withCorridor.people.filter((person) => {
    // Keep only corridor (or vague) seats, not a re-hit of empty plant.
    if (!person.location?.trim()) return true;
    return !personLocationMatchesSelection(person.location, plantCities);
  });

  const labeled = (hqPeople.length ? hqPeople : withCorridor.people).map((person) => ({
    ...person,
    seat: "nearby_hq" as const,
    matchScoreReason: plantSeatReason("nearby_hq", corridorLabels),
  }));

  return {
    people: labeled,
    usedHqFallback: labeled.length > 0,
    corridorLabels,
  };
}

/** True when a person location is inside the plant city or nearby HQ corridor (not a far metro). */
export function seatAllowedOnSave(params: {
  seat?: PlantSeat | null;
  location?: string | null;
  plantCities: string[];
}): boolean {
  if (!params.plantCities.length) return true;
  if (!params.location?.trim()) return true;
  const { people } = selectPeopleForScoutCities(
    [{ location: params.location, matchScore: 50 }],
    params.plantCities,
    { includeHqCorridor: true },
  );
  return people.length > 0;
}

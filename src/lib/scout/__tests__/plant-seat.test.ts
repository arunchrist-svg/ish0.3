import { describe, expect, it } from "vitest";
import {
  corridorOnlyLabels,
  isPlantSeatScout,
  selectPeoplePlantThenCorridor,
  seatAllowedOnSave,
} from "@/lib/scout/plant-seat";

describe("isPlantSeatScout", () => {
  it("true for Ramanagara / Hosur, false for neighborhoods and metros", () => {
    expect(isPlantSeatScout(["Ramanagara"])).toBe(true);
    expect(isPlantSeatScout(["Hosur"])).toBe(true);
    expect(isPlantSeatScout(["Kasturi Nagar"])).toBe(false);
    expect(isPlantSeatScout(["Bengaluru"])).toBe(false);
  });
});

describe("selectPeoplePlantThenCorridor", () => {
  it("keeps plant people and does not pull Bengaluru HQ when plant has hits", () => {
    const result = selectPeoplePlantThenCorridor(
      [
        { name: "PlantHR", location: "Ramanagara, Karnataka", matchScore: 40 },
        { name: "HqDirector", location: "Bengaluru, Karnataka", matchScore: 88 },
        { name: "DelhiHR", location: "New Delhi", matchScore: 95 },
      ],
      ["Ramanagara"],
    );
    expect(result.usedHqFallback).toBe(false);
    expect(result.people.map((p) => p.name)).toEqual(["PlantHR"]);
    expect(result.people[0]?.seat).toBe("plant");
    expect(result.people[0]?.matchScoreReason).toBe("Plant city");
  });

  it("falls back to Bengaluru HQ when plant is empty, still drops Delhi", () => {
    const result = selectPeoplePlantThenCorridor(
      [
        { name: "HqDirector", location: "Bengaluru, Karnataka", matchScore: 88 },
        { name: "DelhiHR", location: "New Delhi", matchScore: 95 },
      ],
      ["Ramanagara"],
    );
    expect(result.usedHqFallback).toBe(true);
    expect(result.people.map((p) => p.name)).toEqual(["HqDirector"]);
    expect(result.people[0]?.seat).toBe("nearby_hq");
    expect(result.people[0]?.matchScoreReason).toMatch(/Nearby HQ: Bengaluru/);
    expect(corridorOnlyLabels(["Ramanagara"])).toEqual(expect.arrayContaining(["Bengaluru", "Bangalore"]));
  });
});

describe("seatAllowedOnSave", () => {
  it("allows nearby_hq in corridor and rejects far metro", () => {
    expect(
      seatAllowedOnSave({
        seat: "nearby_hq",
        location: "Bengaluru",
        plantCities: ["Ramanagara"],
      }),
    ).toBe(true);
    expect(
      seatAllowedOnSave({
        seat: "nearby_hq",
        location: "Delhi",
        plantCities: ["Ramanagara"],
      }),
    ).toBe(false);
  });
});

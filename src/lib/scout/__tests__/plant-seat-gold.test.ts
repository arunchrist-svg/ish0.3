import { describe, expect, it } from "vitest";
import {
  filterPeopleAgainstGoldDrops,
  formatGoldCasesFewShot,
  mergePlantSeatGoldCase,
  parsePlantSeatGoldCases,
} from "@/lib/scout/plant-seat-gold";

describe("plant-seat-gold", () => {
  it("parses and merges keep/drop cases without duplicates", () => {
    const first = mergePlantSeatGoldCase([], {
      companyName: "3M",
      plantCity: "Ramanagara",
      personName: "Anita Rao",
      title: "HR Director",
      location: "Bengaluru",
      seat: "nearby_hq",
      verdict: "keep",
    });
    const second = mergePlantSeatGoldCase(first, {
      companyName: "3M",
      plantCity: "Ramanagara",
      personName: "Anita Rao",
      title: "HR Director",
      location: "Bengaluru",
      seat: "nearby_hq",
      verdict: "drop",
      reason: "Changed mind",
    });
    expect(second).toHaveLength(1);
    expect(second[0]?.verdict).toBe("drop");
  });

  it("filters drop matches by LinkedIn or name+employer", () => {
    const cases = parsePlantSeatGoldCases([
      {
        id: "1",
        companyName: "3M",
        plantCity: "Ramanagara",
        personName: "Veena Bansal",
        linkedIn: "https://www.linkedin.com/in/veena-bansal",
        verdict: "drop",
        createdAt: new Date().toISOString(),
      },
    ]);
    const kept = filterPeopleAgainstGoldDrops(
      [
        { name: "Veena Bansal", linkedIn: "https://linkedin.com/in/veena-bansal" },
        { name: "Anita Rao", linkedIn: "https://linkedin.com/in/anita" },
      ],
      "3M",
      cases,
    );
    expect(kept.map((p) => p.name)).toEqual(["Anita Rao"]);
  });

  it("formats few-shot lines for LLM", () => {
    const text = formatGoldCasesFewShot([
      {
        id: "1",
        companyName: "3M",
        plantCity: "Ramanagara",
        personName: "Anita",
        title: "HR Director",
        location: "Bengaluru",
        seat: "nearby_hq",
        verdict: "keep",
        createdAt: new Date().toISOString(),
      },
    ]);
    expect(text).toMatch(/KEEP: Anita/);
    expect(text).toMatch(/Ramanagara/);
  });
});

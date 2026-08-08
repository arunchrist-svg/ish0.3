import { describe, expect, it } from "vitest";
import { citiesMatch, matchesTargetCity, textMentionsCity } from "../city-match";

describe("city-match", () => {
  it("matches Bangalore and Bengaluru aliases", () => {
    expect(citiesMatch("Bangalore", "Bengaluru")).toBe(true);
    expect(citiesMatch("Mysuru", "Mysore")).toBe(true);
  });

  it("detects city in post text", () => {
    expect(textMentionsCity("Our Bangalore office gifted Diwali hampers", "Bengaluru")).toBe(true);
  });

  it("matchesTargetCity uses extracted city", () => {
    expect(
      matchesTargetCity({
        targetCity: "Bengaluru",
        extractedCity: "Bangalore",
        postText: "thanks HR",
      }),
    ).toBe(true);
  });

  it("matchesTargetCity passes when no target city", () => {
    expect(matchesTargetCity({ targetCity: "", extractedCity: "Chennai" })).toBe(true);
  });

  it("rejects wrong city when target set", () => {
    expect(
      matchesTargetCity({
        targetCity: "Mysore",
        extractedCity: "Bengaluru",
        postText: "gift from company",
      }),
    ).toBe(false);
  });
});

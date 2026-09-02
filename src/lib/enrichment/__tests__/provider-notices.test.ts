import { describe, expect, it } from "vitest";
import {
  filterCompanyNoticesForProvider,
  filterPeopleNoticesForProvider,
} from "@/lib/enrichment/provider-notices";

describe("provider-aware scouting notices", () => {
  it("removes stale Tavily company notices after switching to Places", () => {
    const messages = [
      "Tavily API quota exceeded.",
      "India Directories uses Tavily credits.",
      "Google Places returned no matching businesses.",
    ];

    expect(filterCompanyNoticesForProvider(messages, "google_places")).toEqual([
      "Google Places returned no matching businesses.",
    ]);
  });

  it("preserves India + Tavily and explicit Tavily company notices", () => {
    const messages = ["Tavily API quota exceeded."];

    expect(filterCompanyNoticesForProvider(messages, "india_directories")).toEqual(messages);
    expect(filterCompanyNoticesForProvider(messages, "tavily_ai")).toEqual(messages);
  });

  it("removes stale Tavily people notices when people search is Off", () => {
    const messages = [
      "People search needs Tavily credits.",
      "People search is turned off.",
    ];

    expect(filterPeopleNoticesForProvider(messages, "none")).toEqual([
      "People search is turned off.",
    ]);
    expect(filterPeopleNoticesForProvider(messages, "tavily_ai")).toEqual(messages);
  });
});

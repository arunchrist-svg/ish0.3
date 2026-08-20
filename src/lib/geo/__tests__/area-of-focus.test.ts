import { describe, expect, it } from "vitest";
import { resolveAreaOfFocusFromCatalog, setAllNearbyAreasSelected, areaOfFocusSearchLabels, normalizeScoutAreasOfFocus, upsertScoutAreaOfFocus } from "@/lib/geo/area-of-focus";
import { scoutLocationOptions, locationOptionsFromSelection, defaultLabelsFromLocationOptions } from "@/lib/geo/india";
import { DEFAULT_SCOUT_GEO } from "@/lib/geo/india";
import { companyMatchesScoutSelection, expandCitySearchTerms } from "@/lib/enrichment/city-search";

describe("Kasturi Nagar 5 km catalog resolve", () => {
  it("includes Banaswadi and Ramamurthy Nagar and excludes Whitefield and Electronic City", () => {
    const focus = resolveAreaOfFocusFromCatalog({
      city: "Bengaluru",
      query: "Kasturi Nagar",
      radiusKm: 5,
    });
    expect(focus).not.toBeNull();
    const names = (focus?.nearbyAreas ?? []).map((row) => row.name);
    expect(names).toEqual(expect.arrayContaining(["Kasturi Nagar", "Banaswadi", "Ramamurthy Nagar"]));
    expect(names).not.toContain("Whitefield");
    expect(names).not.toContain("Electronic City");
    expect(focus?.radiusKm).toBe(5);
  });
});

describe("scout locations with area of focus", () => {
  it("lists multiple saved focus clusters as grouped Scout chips", () => {
    const kasturi = resolveAreaOfFocusFromCatalog({
      city: "Bengaluru",
      query: "Kasturi Nagar",
      radiusKm: 5,
    });
    const whitefield = resolveAreaOfFocusFromCatalog({
      city: "Bengaluru",
      query: "Whitefield",
      radiusKm: 5,
    });
    const locations = scoutLocationOptions(DEFAULT_SCOUT_GEO, [kasturi!, whitefield!], "focus");
    const groups = [...new Set(locations.map((o) => o.group))];
    expect(groups).toEqual(expect.arrayContaining(["Kasturi Nagar + 5 km", "Whitefield + 5 km"]));
    expect(locations.map((o) => o.label)).toEqual(expect.arrayContaining(["Kasturi Nagar", "Whitefield"]));
    expect(locations.every((o) => o.kind === "area")).toBe(true);
  });

  it("keeps a legacy single pin and appends a second cluster without duplicates", () => {
    const kasturi = resolveAreaOfFocusFromCatalog({
      city: "Bengaluru",
      query: "Kasturi Nagar",
      radiusKm: 5,
    })!;
    const whitefield = resolveAreaOfFocusFromCatalog({
      city: "Bengaluru",
      query: "Whitefield",
      radiusKm: 5,
    })!;
    const fromLegacy = normalizeScoutAreasOfFocus(undefined, kasturi);
    expect(fromLegacy).toHaveLength(1);
    const both = upsertScoutAreaOfFocus(fromLegacy, whitefield);
    expect(both.map((row) => row.areaName)).toEqual(["Kasturi Nagar", "Whitefield"]);
    expect(upsertScoutAreaOfFocus(both, kasturi)).toHaveLength(2);
  });

  it("returns area chips when focus is set, not Bengaluru Urban", () => {
    const focus = resolveAreaOfFocusFromCatalog({
      city: "Bengaluru",
      query: "Kasturi Nagar",
      radiusKm: 5,
    });
    const locations = scoutLocationOptions(DEFAULT_SCOUT_GEO, focus);
    expect(locations.every((o) => o.kind === "area")).toBe(true);
    expect(locations.map((o) => o.label)).toEqual(expect.arrayContaining(["Kasturi Nagar", "Banaswadi"]));
    expect(locations.map((o) => o.label)).not.toContain("Bengaluru");
    expect(locations[0]?.group).toBe("Kasturi Nagar + 5 km");
  });

  it("returns district chips when focus is cleared", () => {
    const withFocus = scoutLocationOptions(
      DEFAULT_SCOUT_GEO,
      resolveAreaOfFocusFromCatalog({ city: "Bengaluru", query: "Kasturi Nagar", radiusKm: 5 }),
    );
    expect(withFocus.some((o) => o.kind === "area")).toBe(true);

    const cleared = scoutLocationOptions(DEFAULT_SCOUT_GEO, null);
    expect(cleared.some((o) => o.kind === "area")).toBe(false);
    expect(cleared.map((o) => o.label)).toEqual(
      expect.arrayContaining(locationOptionsFromSelection(DEFAULT_SCOUT_GEO).map((o) => o.label)),
    );
    expect(cleared.map((o) => o.label)).toContain("Bengaluru");
  });

  it("loads district chips for Area of Interest even when a focus pin is saved", () => {
    const focus = resolveAreaOfFocusFromCatalog({
      city: "Bengaluru",
      query: "Kasturi Nagar",
      radiusKm: 5,
    });
    const interest = scoutLocationOptions(DEFAULT_SCOUT_GEO, focus, "interest");
    expect(interest.some((o) => o.kind === "area")).toBe(false);
    expect(interest.map((o) => o.label)).toEqual(
      expect.arrayContaining(locationOptionsFromSelection(DEFAULT_SCOUT_GEO).map((o) => o.label)),
    );
    const focusOnly = scoutLocationOptions(DEFAULT_SCOUT_GEO, focus, "focus");
    expect(focusOnly.every((o) => o.kind === "area")).toBe(true);
  });

  it("does not fall back to Entire India when Focus Area has no pin", () => {
    expect(scoutLocationOptions(DEFAULT_SCOUT_GEO, null, "focus")).toEqual([]);
  });

  it("keeps area chips when none are selected and does not restore districts", () => {
    const focus = setAllNearbyAreasSelected(
      resolveAreaOfFocusFromCatalog({
        city: "Bengaluru",
        query: "Kasturi Nagar",
        radiusKm: 5,
      })!,
      false,
    );
    const locations = scoutLocationOptions(DEFAULT_SCOUT_GEO, focus);
    expect(locations.every((o) => o.kind === "area")).toBe(true);
    expect(locations.map((o) => o.label)).toEqual(expect.arrayContaining(["Kasturi Nagar", "Banaswadi"]));
    expect(locations.every((o) => o.selected === false)).toBe(true);
    expect(defaultLabelsFromLocationOptions(locations)).toEqual([]);
    expect(areaOfFocusSearchLabels(focus)).toEqual([]);
    expect(locations.map((o) => o.label)).not.toContain("Bengaluru");
  });
});

describe("area of focus search terms", () => {
  it("does not fall back to entire Bengaluru Urban while focus is active", () => {
    const focus = resolveAreaOfFocusFromCatalog({
      city: "Bengaluru",
      query: "Kasturi Nagar",
      radiusKm: 5,
    });
    const labels = scoutLocationOptions(DEFAULT_SCOUT_GEO, focus).map((o) => o.label);
    const terms = expandCitySearchTerms(labels);
    expect(terms).toEqual(expect.arrayContaining(["Kasturi Nagar", "Banaswadi"]));
    expect(terms).not.toContain("Bengaluru Urban");
    expect(terms).not.toContain("Bengaluru");
    expect(terms).not.toContain("Bangalore");
  });
});

describe("neighborhood-only company filter", () => {
  it("keeps locality mentions and drops plain Bengaluru or far suburbs", () => {
    const labels = ["Kasturi Nagar", "Banaswadi", "Ramamurthy Nagar"];
    expect(companyMatchesScoutSelection({ city: "Bengaluru" }, labels)).toBe(false);
    expect(companyMatchesScoutSelection({ city: "Bengaluru", intelNotes: "Mindtree" }, labels)).toBe(false);
    expect(
      companyMatchesScoutSelection(
        { city: "Bengaluru", intelNotes: "Office in Kasturi Nagar" },
        labels,
      ),
    ).toBe(true);
    expect(
      companyMatchesScoutSelection(
        {
          city: "Bengaluru",
          intelNotes: "Address: 12 Main Road, Banaswadi, Bengaluru",
        },
        labels,
      ),
    ).toBe(true);
    expect(companyMatchesScoutSelection({ city: "Whitefield" }, labels)).toBe(false);
    expect(companyMatchesScoutSelection({ city: "Electronic City" }, labels)).toBe(false);
    expect(companyMatchesScoutSelection({ city: "Kasturi Nagar" }, labels)).toBe(true);
    expect(companyMatchesScoutSelection({ city: "" }, labels)).toBe(false);
  });

  it("keeps geo-verified local businesses even when city is only Bengaluru", () => {
    const labels = ["Kasturi Nagar", "Banaswadi"];
    expect(
      companyMatchesScoutSelection(
        { city: "Bengaluru", intelNotes: "Address: Old Madras Road, Bengaluru" },
        labels,
        { searchKind: "business", geoVerified: true },
      ),
    ).toBe(true);
    expect(
      companyMatchesScoutSelection(
        { city: "Bengaluru", intelNotes: "Address: Old Madras Road, Bengaluru" },
        labels,
        { searchKind: "industry", geoVerified: true },
      ),
    ).toBe(true);
    expect(
      companyMatchesScoutSelection(
        { city: "Bengaluru", intelNotes: "Address: Old Madras Road, Bengaluru" },
        labels,
        { searchKind: "industry" },
      ),
    ).toBe(false);
    expect(
      companyMatchesScoutSelection({ city: "Bengaluru" }, labels, {
        searchKind: "business",
        geoVerified: false,
      }),
    ).toBe(false);
  });
});

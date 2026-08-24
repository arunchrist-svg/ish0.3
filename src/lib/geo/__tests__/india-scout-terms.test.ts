import { describe, expect, it } from "vitest";
import {
  compactSearchTermsForScoutLabels,
  citiesForGiftIntelSweep,
  defaultScoutLocationLabels,
  districtGroupsForScoutOptions,
  isScoutDistrictPicked,
  locationOptionsFromSelection,
  matchTermsForScoutLabels,
  resolveScoutLabel,
  scoutGeoFromStateAndDistrictPicks,
  searchTermsForScoutLabels,
  setScoutStateDistricts,
  toggleScoutDistrictPick,
} from "@/lib/geo/india";

describe("scout geo label expansion", () => {
  it("resolves Telangana as a state", () => {
    const resolved = resolveScoutLabel("Telangana");
    expect(resolved?.kind).toBe("state");
    if (resolved?.kind === "state") expect(resolved.state.id).toBe("TS");
  });

  it("keeps Telangana queries compact and includes Hyderabad", () => {
    const terms = searchTermsForScoutLabels(["Telangana"]);
    expect(terms).toContain("Telangana");
    expect(terms).toContain("Hyderabad");
    expect(terms.length).toBeLessThan(12);
    expect(terms).not.toContain("Adilabad");
  });

  it("matches Hyderabad and Secunderabad to selected Telangana", () => {
    const match = matchTermsForScoutLabels(["Telangana"]).map((t) => t.toLowerCase());
    expect(match).toContain("hyderabad");
    expect(match).toContain("secunderabad");
    expect(match).toContain("warangal");
  });

  it("does not over-expand Entire India into district filters", () => {
    expect(compactSearchTermsForScoutLabels(["Entire India"])).toEqual(["India"]);
    expect(matchTermsForScoutLabels(["India"])).toEqual(["India"]);
  });

  it("builds scout geo from whole states vs narrowed districts", () => {
    const whole = scoutGeoFromStateAndDistrictPicks(false, ["TS"], {});
    expect(whole.stateIds).toEqual(["TS"]);
    expect(whole.districtIds).toEqual([]);

    const narrowed = scoutGeoFromStateAndDistrictPicks(false, ["TS"], {
      TS: ["TS-hyderabad"],
    });
    expect(narrowed.stateIds).toEqual([]);
    expect(narrowed.districtIds).toEqual(["TS-hyderabad"]);
  });

  it("expands a selected state into its districts for the picker", () => {
    const groups = districtGroupsForScoutOptions([{ label: "Karnataka", kind: "state" }]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.state.id).toBe("KA");
    expect(groups[0]?.districts.length).toBeGreaterThan(5);
  });

  it("only lists districts that were added in Settings", () => {
    const groups = districtGroupsForScoutOptions([
      { label: "Karnataka", kind: "state" },
      { label: "Hosur", kind: "district" },
      { label: "Madras", kind: "district" },
    ]);
    const byState = Object.fromEntries(groups.map((g) => [g.state.id, g.districts.map((d) => d.displayName)]));
    expect(byState.KA?.length).toBeGreaterThan(5);
    expect(byState.TN?.sort()).toEqual(["Hosur", "Madras"].sort());
  });

  it("unselecting one Karnataka district keeps Hosur and the other KA districts", () => {
    const next = toggleScoutDistrictPick(["Karnataka", "Hosur"], "KA-bengaluru-urban");
    expect(next).toContain("Hosur");
    expect(next).not.toContain("Karnataka");
    const bengaluru = resolveScoutLabel("Bengaluru");
    expect(bengaluru?.kind).toBe("district");
    if (bengaluru?.kind === "district") {
      expect(isScoutDistrictPicked(next, bengaluru.district)).toBe(false);
    }
    expect(next.length).toBeGreaterThan(2);
  });

  it("allows clearing every district so nothing is selected", () => {
    const hosur = resolveScoutLabel("Hosur");
    const madras = resolveScoutLabel("Madras");
    expect(hosur?.kind).toBe("district");
    expect(madras?.kind).toBe("district");
    if (hosur?.kind !== "district" || madras?.kind !== "district") return;

    const cleared = setScoutStateDistricts(["Hosur", "Madras"], "TN", false, [
      hosur.district.id,
      madras.district.id,
    ]);
    expect(cleared).toEqual([]);

    const emptied = toggleScoutDistrictPick(["Hosur"], hosur.district.id);
    expect(emptied).toEqual([]);
  });

  it("keeps All and Clear independent: Clear then All restores the state pool", () => {
    const hosur = resolveScoutLabel("Hosur");
    const madras = resolveScoutLabel("Madras");
    expect(hosur?.kind).toBe("district");
    expect(madras?.kind).toBe("district");
    if (hosur?.kind !== "district" || madras?.kind !== "district") return;

    const cleared = setScoutStateDistricts(["Hosur", "Madras"], "TN", false);
    expect(cleared).toEqual([]);
    const restored = setScoutStateDistricts(cleared, "TN", true, [
      hosur.district.id,
      madras.district.id,
    ]);
    expect(restored.sort()).toEqual(["Hosur", "Madras"].sort());
  });

  it("does not pass Entire India as a gift intel city", () => {
    expect(citiesForGiftIntelSweep(["Entire India"])).toBeUndefined();
    expect(citiesForGiftIntelSweep(["India"])).toBeUndefined();
    expect(citiesForGiftIntelSweep(["Entire India", "Bengaluru"])).toEqual(["Bengaluru"]);
  });

  it("defaults gift intel cities to Settings scoutGeo districts", () => {
    const labels = defaultScoutLocationLabels();
    expect(labels).toContain("Bengaluru");
    expect(labels).toContain("Hosur");
    expect(labels).not.toContain("Entire India");
    expect(citiesForGiftIntelSweep(labels)?.length).toBeGreaterThan(0);

    const telangana = locationOptionsFromSelection({
      entireIndia: false,
      regionIds: [],
      stateIds: ["TS"],
      districtIds: [],
    });
    expect(telangana.map((o) => o.label)).toEqual(["Telangana"]);
  });
});

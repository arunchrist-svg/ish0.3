import { describe, expect, it } from "vitest";
import {
  compactSearchTermsForScoutLabels,
  matchTermsForScoutLabels,
  resolveScoutLabel,
  scoutGeoFromStateAndDistrictPicks,
  searchTermsForScoutLabels,
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
});

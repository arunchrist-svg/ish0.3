import { describe, expect, it } from "vitest";
import { extractCityFromAddress } from "@/lib/enrichment/google-places";
import { cleanCompanyName } from "@/lib/enrichment/directory-parser";

describe("extractCityFromAddress", () => {
  it("maps Bengaluru neighborhoods to Bengaluru even when scout query is Ramanagara", () => {
    expect(extractCityFromAddress("Kadugodi, Karnataka, India", "Ramanagara")).toBe("Bengaluru");
    expect(
      extractCityFromAddress("Telecom Layout, Whitefield, Karnataka, India", "Ramanagara"),
    ).toBe("Bengaluru");
    expect(extractCityFromAddress("KP Agrahara, Karnataka, India", "Ramanagara")).toBe("Bengaluru");
  });

  it("keeps Ramanagara when the address actually contains Ramanagara", () => {
    expect(
      extractCityFromAddress("SIPCOT, Ramanagara, Karnataka, India", "Ramanagara"),
    ).toBe("Ramanagara");
  });

  it("does not stamp the query city onto incomplete neighborhood-only addresses", () => {
    expect(extractCityFromAddress("Some Local Spot, Karnataka, India", "Ramanagara")).toBeUndefined();
    expect(extractCityFromAddress(undefined, "Ramanagara")).toBeUndefined();
  });

  it("prefers Bengaluru when the address names the metro", () => {
    expect(
      extractCityFromAddress("Vivanta, Bengaluru, Karnataka, India", "Ramanagara"),
    ).toBe("Bengaluru");
  });
});

describe("cleanCompanyName rejects place junk from Places", () => {
  it.each([
    "City Busstand",
    "Opp Janane school",
    "TELECOM LYT",
    "KP AGRAHARA",
    "GOPALAN RESIDENCY",
    "Bangalore - 560 032",
    "Districts and divisions",
    "Kadugodi",
  ])("drops %s", (name) => {
    expect(cleanCompanyName(name)).toBeNull();
  });
});

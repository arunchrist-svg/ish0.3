import { describe, expect, it } from "vitest";
import {
  pickMatchingAccount,
  scoutAccountDedupeKey,
  uniqueScoutCompanies,
} from "@/lib/scout/account-match";

describe("scoutAccountDedupeKey", () => {
  it("prefers domain over name and city", () => {
    expect(
      scoutAccountDedupeKey({ name: "Bosch", city: "Bengaluru", domain: "bosch.in" }),
    ).toBe("d:bosch.in");
  });

  it("uses name+city when domain is missing", () => {
    expect(scoutAccountDedupeKey({ name: "Acme Tools", city: "Pune" })).toBe("nc:acme tools|pune");
  });

  it("collapses legal suffixes in the name key", () => {
    expect(scoutAccountDedupeKey({ name: "Infosys Ltd", city: "Bengaluru" })).toBe(
      scoutAccountDedupeKey({ name: "Infosys", city: "Bengaluru" }),
    );
  });
});

describe("uniqueScoutCompanies", () => {
  it("drops a second save of the same name+city", () => {
    const unique = uniqueScoutCompanies([
      { name: "Titan", city: "Hosur" },
      { name: "Titan Company Ltd", city: "Hosur" },
    ]);
    expect(unique).toHaveLength(1);
    expect(unique[0]?.name).toBe("Titan");
  });

  it("keeps same name in different cities", () => {
    const unique = uniqueScoutCompanies([
      { name: "Bosch", city: "Bengaluru" },
      { name: "Bosch", city: "Chennai" },
    ]);
    expect(unique).toHaveLength(2);
  });

  it("collapses two rows that share a domain", () => {
    const unique = uniqueScoutCompanies([
      { name: "Infosys", city: "Bengaluru", domain: "infosys.com" },
      { name: "Infosys BPM", city: "Pune", domain: "infosys.com" },
    ]);
    expect(unique).toHaveLength(1);
  });

  it("skips companies without a name", () => {
    expect(uniqueScoutCompanies([{ name: "  ", city: "Pune" }, { name: "Ok", city: "Pune" }])).toHaveLength(
      1,
    );
  });
});

describe("pickMatchingAccount", () => {
  const stored = [
    { id: "1", name: "Bosch Ltd", city: "Bengaluru", domain: null },
    { id: "2", name: "Bosch", city: "Chennai", domain: null },
    { id: "3", name: "Titan", city: "Hosur", domain: "titan.co.in" },
  ];

  it("matches by domain even when the city differs", () => {
    const match = pickMatchingAccount(stored, {
      name: "Titan Company",
      city: "Bengaluru",
      domain: "titan.co.in",
    });
    expect(match?.id).toBe("3");
  });

  it("matches by name+city", () => {
    const match = pickMatchingAccount(stored, { name: "Bosch", city: "Bengaluru" });
    expect(match?.id).toBe("1");
  });

  it("does not match the same name in a different city", () => {
    const match = pickMatchingAccount(stored, { name: "Bosch", city: "Pune" });
    expect(match).toBeUndefined();
  });

  it("merges into a name match with an empty city", () => {
    const match = pickMatchingAccount(
      [{ id: "4", name: "Wipro", city: null, domain: null }],
      { name: "Wipro", city: "Bengaluru" },
    );
    expect(match?.id).toBe("4");
  });
});

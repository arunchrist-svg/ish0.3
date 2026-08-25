import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { hitShowsCurrentEmployment } from "@/lib/enrichment/person-company-match";
import { isFestivalBuyerRole } from "@/lib/enrichment/people-role-filter";
import { selectPeopleForScoutCities } from "@/lib/enrichment/city-search";
import { sortCompaniesByAccountScore } from "@/lib/enrichment/account-score";
import { scoutQualityProfileFor } from "@/lib/enrichment/quality-profile";
import type { ScoutCompanyResult, ScoutPersonResult } from "@/lib/enrichment/types";

type PersonCase = {
  id: string;
  expected: "accept" | "reject";
  reason: string;
  companyName: string;
  person: { name: string; title?: string; bio?: string; location?: string };
  selectedCities?: string[];
};

type AccountCase = {
  id: string;
  expected: "accept" | "reject";
  reason: string;
  selectedCities: string[];
  companies: Partial<ScoutCompanyResult> & { name: string }[];
};

const root = join(process.cwd(), "src/lib/enrichment/__fixtures__/gold");

function loadJson<T>(file: string): T {
  return JSON.parse(readFileSync(join(root, file), "utf8")) as T;
}

function asPerson(p: PersonCase["person"]): ScoutPersonResult {
  return {
    name: p.name,
    title: p.title,
    bio: p.bio,
    location: p.location,
    emailStatus: "missing",
    dataSource: "gold",
  };
}

describe("scout gold set eval", () => {
  const people = loadJson<PersonCase[]>("people.json");
  const rolesGeo = loadJson<PersonCase[]>("roles-geo.json");
  const accounts = loadJson<AccountCase[]>("accounts.json");

  it.each(people.map((c) => [c.id, c] as const))("%s employer", (_id, c) => {
    const ok = hitShowsCurrentEmployment(
      { title: c.person.title ?? "", content: c.person.bio ?? "" },
      c.companyName,
    );
    if (c.expected === "accept") expect(ok).toBe(true);
    else expect(ok).toBe(false);
  });

  it.each(rolesGeo.filter((c) => c.reason === "buyer_role").map((c) => [c.id, c] as const))(
    "%s buyer role",
    (_id, c) => {
      const ok = isFestivalBuyerRole(c.person.title ?? "");
      if (c.expected === "accept") expect(ok).toBe(true);
      else expect(ok).toBe(false);
    },
  );

  it.each(rolesGeo.filter((c) => c.reason === "city_corridor").map((c) => [c.id, c] as const))(
    "%s city corridor",
    (_id, c) => {
      const { people: kept } = selectPeopleForScoutCities([asPerson(c.person)], ["Hosur"], {
        includeHqCorridor: true,
      });
      if (c.expected === "accept") expect(kept.map((p) => p.name)).toContain(c.person.name);
      else expect(kept.map((p) => p.name)).not.toContain(c.person.name);
    },
  );

  it.each(accounts.map((c) => [c.id, c] as const))("%s account rank", (_id, c) => {
    const ranked = sortCompaniesByAccountScore(
      c.companies.map((company) => ({ dataSource: "gold", ...company })),
      {
        profile: scoutQualityProfileFor("corporate_gifting"),
        selectedCities: c.selectedCities,
        locationScope: "interest",
      },
    );
    expect(ranked[0]?.name).toBe("Acme Auto Pvt Ltd");
  });
});

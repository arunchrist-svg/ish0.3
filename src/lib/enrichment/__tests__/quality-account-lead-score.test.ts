import { describe, expect, it } from "vitest";
import { computeAccountScore, sortCompaniesByAccountScore, applyGoldDensityEarlyStop } from "@/lib/enrichment/account-score";
import { scoutQualityProfileFor } from "@/lib/enrichment/quality-profile";
import {
  rankPeopleForScout,
  trimPeopleToHighConfidence,
} from "@/lib/enrichment/people-diversity";
import type { ScoutCompanyResult, ScoutPersonResult } from "@/lib/enrichment/types";
import {
  entitiesReferToSameCompany,
  hitShowsCurrentEmployment,
  personTitleConflictsWithCompany,
} from "@/lib/enrichment/person-company-match";

function company(partial: Partial<ScoutCompanyResult> & { name: string }): ScoutCompanyResult {
  return {
    dataSource: "test",
    fitScore: 50,
    ...partial,
  };
}

function person(partial: Partial<ScoutPersonResult> & { name: string }): ScoutPersonResult {
  return {
    emailStatus: "missing",
    dataSource: "test",
    ...partial,
  };
}

describe("scoutQualityProfileFor", () => {
  it("uses sweets weights ordered reachability > website > locality", () => {
    const sweets = scoutQualityProfileFor("corporate_gifting", "gifting-sweets");
    expect(sweets.weights.reachability).toBeGreaterThan(sweets.weights.officialWebsite);
    expect(sweets.weights.officialWebsite).toBeGreaterThan(sweets.weights.locality);
    expect(sweets.weights.locality).toBeGreaterThan(sweets.weights.scaleFit);
    expect(sweets.sellerPollution).toBe("separate_modes");
    expect(sweets.broadenPeopleWhenEmpty).toBe(true);
    expect(sweets.industryBoostTerms).toContain("manufacturing");
  });

  it("does not use sweets seller gate for appliances / general", () => {
    const appliances = scoutQualityProfileFor("appliances", "gifting-appliances");
    const general = scoutQualityProfileFor("general_b2b", "general");
    expect(appliances.intent).toBe("appliances");
    expect(appliances.sellerPollution).toBe("separate_modes");
    expect(general.intent).toBe("general_b2b");
    expect(general.sellerPollution).toBe("soft_demote");
    expect(general.industryBoostTerms).not.toContain("mithai");
  });
});

describe("AccountScore", () => {
  const profile = scoutQualityProfileFor("corporate_gifting");

  it("ranks reachable official-site local companies above weak unknowns", () => {
    const best = company({
      name: "Acme Auto Pvt Ltd",
      domain: "acmeauto.com",
      city: "Hosur",
      employees: "120",
      industry: "Manufacturing",
      leadabilityScore: 90,
      leadabilityBand: "high",
      fitScore: 60,
    });
    const weak = company({
      name: "Mystery Works",
      city: "Chennai",
      leadabilityBand: "unknown",
      fitScore: 70,
    });
    const ranked = sortCompaniesByAccountScore([weak, best], {
      profile,
      selectedCities: ["Hosur"],
      employeeBands: ["medium"],
      selectedIndustries: ["Manufacturing"],
      locationScope: "interest",
    });
    expect(ranked[0]?.name).toBe("Acme Auto Pvt Ltd");
  });

  it("honors selected employee bands for scaleFit (not bigger-is-better)", () => {
    const small = company({
      name: "Small Plant",
      domain: "smallplant.in",
      city: "Hosur",
      employees: "25",
      leadabilityBand: "medium",
      leadabilityScore: 52,
    });
    const large = company({
      name: "Giant Corp",
      domain: "giantcorp.com",
      city: "Hosur",
      employees: "5000",
      leadabilityBand: "medium",
      leadabilityScore: 52,
    });
    const smallScore = computeAccountScore(small, {
      profile,
      selectedCities: ["Hosur"],
      employeeBands: ["small"],
    });
    const largeScore = computeAccountScore(large, {
      profile,
      selectedCities: ["Hosur"],
      employeeBands: ["small"],
    });
    expect(smallScore.scaleFit).toBe(1);
    expect(largeScore.scaleFit).toBe(0);
    expect(smallScore.total).toBeGreaterThan(largeScore.total);
  });
});

describe("LeadScore", () => {
  it("prefers Focus Area HR heads over far untitled profiles", () => {
    const ranked = rankPeopleForScout(
      [
        person({
          name: "Far Person",
          title: "Analyst",
          location: "Delhi",
          matchScore: 40,
        }),
        person({
          name: "Plant HR",
          title: "Head of HR",
          department: "HR",
          location: "Hosur, Tamil Nadu",
          linkedIn: "https://www.linkedin.com/in/plant-hr",
          isKeyDM: true,
        }),
      ],
      {
        departments: ["HR", "Procurement"],
        preferredCities: ["SIPCOT Hosur", "Hosur"],
        preferDmTitles: true,
      },
    );
    expect(ranked[0]?.name).toBe("Plant HR");
    expect((ranked[0]?.matchScore ?? 0)).toBeGreaterThan(ranked[1]?.matchScore ?? 0);
  });

  it("trims to high-confidence gold slice when enough strong leads exist", () => {
    const people = [
      person({ name: "A", title: "HR Director", matchScore: 90 }),
      person({ name: "B", title: "Procurement Head", matchScore: 80 }),
      person({ name: "C", title: "HR Manager", matchScore: 70 }),
      person({ name: "D", title: "Intern", matchScore: 10 }),
      person({ name: "E", title: "Unknown", matchScore: 5 }),
    ];
    const trimmed = trimPeopleToHighConfidence(people, 3);
    expect(trimmed).toHaveLength(3);
    expect(trimmed.map((p) => p.name)).toEqual(["A", "B", "C"]);
  });
});

describe("wrong-employer regressions still hold", () => {
  it("rejects Nissan Trading India on generic Nissan scout", () => {
    const title = "Amit Kumar Patnaik | Head - Human Resources ( Nissan Trading India ) | LinkedIn";
    const content =
      "Head - Human Resources ( Nissan Trading India)\nNissan Motor Corporation · Full-time\nDec 2008 - Present";
    expect(entitiesReferToSameCompany("Nissan Trading India", "Nissan")).toBe(false);
    expect(personTitleConflictsWithCompany(title, "Nissan")).toBe(true);
    expect(hitShowsCurrentEmployment({ title, content }, "Nissan")).toBe(false);
  });

  it("rejects Anusha at 3M when scouting Aron Universal", () => {
    expect(
      hitShowsCurrentEmployment(
        {
          title: "Anusha Ramachandra | Manager Human Resources | LinkedIn",
          content:
            "Human Resources Manager\n3M · May 2024 - Present · 2 yrs\n\nHR Executive\nAron Universal Ltd · Jun 2014 - Jan 2016",
        },
        "Aron Universal",
      ),
    ).toBe(false);
  });
});

describe("sellerPollution behavior", () => {
  it("soft_demote keeps the seller but ranks it below a buyer", () => {
    const general = scoutQualityProfileFor("general_b2b");
    const seller = company({
      name: "Acme SaaS Reseller",
      industry: "software reseller",
      intelNotes: "competing software vendor",
      domain: "reseller.io",
      city: "Bengaluru",
      leadabilityBand: "high",
    });
    const buyer = company({
      name: "Hosur Auto Plant",
      domain: "hosurauto.com",
      city: "Bengaluru",
      industry: "Manufacturing",
      leadabilityBand: "high",
    });
    const ranked = sortCompaniesByAccountScore([seller, buyer], {
      profile: general,
      selectedCities: ["Bengaluru"],
    });
    expect(ranked.map((c) => c.name)).toContain("Acme SaaS Reseller");
    expect(ranked[0]?.name).toBe("Hosur Auto Plant");
  });
});

describe("gold density early stop", () => {
  it("cuts a low-score tail before the requested limit", () => {
    const gold = company({
      name: "Gold Co",
      leadabilityBand: "high",
      fitScore: 80,
      domain: "gold.co",
      city: "Hosur",
    });
    const filler = (n: number) =>
      company({ name: `Low ${n}`, leadabilityBand: "unknown", fitScore: 10, city: "Chennai" });
    const ranked = [gold, gold, gold, filler(1), filler(2), filler(3), filler(4), filler(5), filler(6)];
    const cut = applyGoldDensityEarlyStop(ranked, { limit: 9, enabled: true });
    expect(cut.earlyStop).toBe(true);
    expect(cut.companies.length).toBeLessThan(9);
    expect(cut.companies.filter((c) => c.name.startsWith("Low")).length).toBeLessThan(5);
  });
});

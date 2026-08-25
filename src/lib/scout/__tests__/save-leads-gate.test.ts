import { describe, expect, it } from "vitest";
import { scoutPersonSaveGate } from "@/lib/scout/save-leads";
import type { ScoutCompanyResult, ScoutPersonResult } from "@/lib/enrichment/types";

function person(partial: Partial<ScoutPersonResult> & { name: string }): ScoutPersonResult {
  return {
    name: partial.name,
    title: partial.title,
    bio: partial.bio,
    department: partial.department,
    seniority: partial.seniority,
    dataSource: "test",
    emailStatus: "missing",
  };
}

function company(name: string): ScoutCompanyResult {
  return { name, dataSource: "test" };
}

describe("scoutPersonSaveGate sweets", () => {
  const titan = company("Titan Company");

  it("saves a festival buyer currently at the company", () => {
    expect(
      scoutPersonSaveGate(person({ name: "Asha", title: "HR Manager at Titan Company" }), titan, {
        sweetsGifting: true,
      }),
    ).toEqual({ pass: true, reason: "festival sweets buyer role" });
  });

  it("skips Finance Director and untitled people as non-buyers", () => {
    expect(
      scoutPersonSaveGate(person({ name: "Arjun", title: "Finance Director" }), titan, {
        sweetsGifting: true,
      }).reason,
    ).toBe("not a festival sweets buyer");
    expect(
      scoutPersonSaveGate(person({ name: "Deepa" }), titan, { sweetsGifting: true }).reason,
    ).toBe("not a festival sweets buyer");
  });

  it("skips people whose title names a different employer", () => {
    expect(
      scoutPersonSaveGate(person({ name: "Meera", title: "HR Manager at Bosch" }), titan, {
        sweetsGifting: true,
      }),
    ).toEqual({ pass: false, reason: "does not work at this company" });
  });

  it("skips Open to Work and former employees", () => {
    expect(
      scoutPersonSaveGate(
        person({ name: "Kiran", title: "HR Director", bio: "Open to Work | ex Titan Company" }),
        titan,
        { sweetsGifting: true },
      ).reason,
    ).toBe("open to work profile");
    expect(
      scoutPersonSaveGate(
        person({ name: "Karthi P", title: "Human Resources Manager at Autosense | OPEN_TO_WORK" }),
        company("Autosense Private Limited"),
        { sweetsGifting: true },
      ).reason,
    ).toBe("open to work profile");
  });

  it("rejects Open to Work even when saved from the scout wizard", () => {
    expect(
      scoutPersonSaveGate(
        person({ name: "Manikandan R", title: "HR Executive", bio: "#OPENTOWORK" }),
        titan,
        { leadSource: "scout_wizard" },
      ),
    ).toEqual({ pass: false, reason: "open to work profile" });
  });

  it("rejects former employees saved from the scout wizard", () => {
    expect(
      scoutPersonSaveGate(
        person({ name: "Kiran", title: "HR Director", bio: "ex Titan Company" }),
        titan,
        { leadSource: "scout_wizard" },
      ),
    ).toEqual({ pass: false, reason: "does not work at this company" });
  });

  it("still trusts the wizard for a clean current employee", () => {
    expect(
      scoutPersonSaveGate(person({ name: "Asha", title: "HR Manager" }), titan, {
        leadSource: "scout_wizard",
      }),
    ).toEqual({ pass: true, reason: "user-selected from scout wizard" });
  });

  it("skips borderline Sai Lifescience on a Sai Chemicals scout", () => {
    expect(
      scoutPersonSaveGate(
        person({
          name: "Mehar Babu",
          title: "HR at Sai Lifescience",
          bio: "Sai Lifescience · Present",
          matchScore: 20,
        }),
        company("Sai Chemicals"),
        { sweetsGifting: true },
      ),
    ).toEqual({ pass: false, reason: "employer verify failed" });
  });

  it("keeps a TVS Motor HR lead with a strong match", () => {
    expect(
      scoutPersonSaveGate(
        person({
          name: "Priya",
          title: "HR Head at TVS",
          bio: "TVS Motor · Present",
          matchScore: 72,
        }),
        company("TVS Motor"),
        { sweetsGifting: true },
      ).pass,
    ).toBe(true);
  });
});

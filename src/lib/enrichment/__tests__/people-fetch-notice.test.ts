import { describe, expect, it } from "vitest";
import { summarizeEmptyPeopleFetch } from "@/lib/enrichment/people-fetch-notice";

describe("summarizeEmptyPeopleFetch", () => {
  it("says all 10 companies were searched, not only COPRAL", () => {
    const notice = summarizeEmptyPeopleFetch({
      companyCount: 10,
      cities: ["Hosur"],
      warnings: [
        "No website domain for COPRAL ENERGY PRIVATE LIMITED. People search may be less accurate.",
        "No decision-makers found in Hosur for Bosch. Try another company or nearby city.",
        "No decision-makers found in Hosur for Titan. Try another company or nearby city.",
      ],
    });
    expect(notice.headline).toMatch(/Searched 10 companies/i);
    expect(notice.detail).toMatch(/Each of the 10 selected companies was searched/i);
    expect(notice.detail).toMatch(/Zauba|IndiaMART|Paste/i);
    expect(notice.detail).toMatch(/nearby HQ/i);
    expect(notice.detail).not.toMatch(/people outside those cities are dropped/i);
  });

  it("reports Tavily quota stop after a subset", () => {
    const notice = summarizeEmptyPeopleFetch({
      companyCount: 10,
      warnings: [
        "Tavily API quota exceeded. Upgrade at tavily.com or wait for your monthly credit reset.",
        "Skipped Acme Pvt Ltd: Tavily quota after earlier companies.",
      ],
    });
    expect(notice.headline).toMatch(/Tavily credits ran out/i);
    expect(notice.headline).toMatch(/10/);
  });

  it("does not say credits ran out when Tavily only rate-limited a key with remaining credits", () => {
    const notice = summarizeEmptyPeopleFetch({
      companyCount: 10,
      warnings: [
        "Tavily is rate-limiting right now. Credits are still available. Wait a few seconds and fetch again.",
      ],
    });
    expect(notice.headline).toMatch(/slow down/i);
    expect(notice.detail).toMatch(/still has credits/i);
    expect(notice.headline).not.toMatch(/credits ran out/i);
  });

  it("does not blame Hosur for dropping people when search found nobody", () => {
    const notice = summarizeEmptyPeopleFetch({
      companyCount: 4,
      cities: ["Hosur"],
      seniority: ["Director"],
      departments: ["HR", "Procurement"],
      warnings: [],
    });
    expect(notice.detail).toMatch(/nearby HQ/i);
    expect(notice.detail).not.toMatch(/people outside those cities are dropped/i);
    expect(notice.detail).toMatch(/HR, Procurement, Director/);
  });

  it("says plant and corridor were both searched when HQ fallback is empty", () => {
    const notice = summarizeEmptyPeopleFetch({
      companyCount: 1,
      cities: ["Ramanagara"],
      warnings: [
        "Searched plant city Ramanagara and nearby HQ corridor (Bengaluru / Bangalore). No matching decision-makers.",
      ],
    });
    expect(notice.detail).toMatch(/plant city.*nearby HQ corridor/i);
    expect(notice.detail).toMatch(/both were empty|both searched/i);
    expect(notice.detail).not.toMatch(/Empty is OK/i);
  });

  it("surfaces plant-city role miss with LinkedIn explanation, not India-wide copy", () => {
    const notice = summarizeEmptyPeopleFetch({
      companyCount: 2,
      cities: ["Hosur"],
      seniority: ["Director"],
      departments: ["HR", "Procurement"],
      warnings: [
        "No HR, Procurement, Admin, or Facilities people found at Titan Company. LinkedIn may not list plant-level HR publicly — try a larger brand in this city.",
      ],
    });
    expect(notice.detail).toMatch(/no hr|linkedin/i);
    expect(notice.detail).not.toMatch(/anywhere in India/i);
  });
});

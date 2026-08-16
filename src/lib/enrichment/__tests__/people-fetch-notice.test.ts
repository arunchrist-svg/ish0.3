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
    expect(notice.detail).toMatch(/website/i);
    expect(notice.detail).not.toBe(
      "No website domain for COPRAL ENERGY PRIVATE LIMITED. People search may be less accurate.",
    );
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
});

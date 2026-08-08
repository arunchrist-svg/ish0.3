import { describe, expect, it } from "vitest";
import {
  cleanCompanyName,
  isPlausibleCompanyName,
  parseCompaniesFromDirectoryResults,
} from "@/lib/enrichment/directory-parser";

describe("cleanCompanyName / isPlausibleCompanyName", () => {
  it("rejects job posts, documents, and report titles", () => {
    const junk = [
      "IT and operations. Samsara is Hiring",
      "View 295 Jobs ### Navan",
      "This document contains a list of company addresses in Bengaluru",
      "India in 2026",
      "Browse top technology companies",
      "Find business near me",
    ];
    for (const name of junk) {
      expect(isPlausibleCompanyName(name), name).toBe(false);
      expect(cleanCompanyName(name), name).toBeNull();
    }
  });

  it("accepts real company names", () => {
    const good = [
      "SingleStore",
      "6sense",
      "Motive",
      "Netskope",
      "LaunchDarkly",
      "Forward Networks",
      "Infosys",
      "Bosch India",
      "Titan Company Ltd",
    ];
    for (const name of good) {
      expect(isPlausibleCompanyName(name), name).toBe(true);
      expect(cleanCompanyName(name), name).toBe(name);
    }
  });

  it("extracts company from hiring titles in directory parse", () => {
    const results = parseCompaniesFromDirectoryResults(
      [
        {
          title: "IT and operations. Samsara is Hiring",
          url: "https://example.com/jobs/samsara",
          content: "Open roles in Bengaluru",
        },
        {
          title: "View 295 Jobs ### Navan",
          url: "https://example.com/jobs/navan",
          content: "Careers",
        },
        {
          title: "This document contains a list of company addresses in Bengaluru",
          url: "https://example.com/doc.pdf",
          content: "Address list for the region",
        },
        {
          title: "SingleStore | Company Profile",
          url: "https://example.com/singlestore",
          content: "Database company · Bengaluru",
        },
      ],
      ["Bengaluru"],
      10,
    );

    const names = results.map((r) => r.name);
    expect(names).toContain("Samsara");
    expect(names).toContain("Navan");
    expect(names).toContain("SingleStore");
    expect(names.some((n) => /is Hiring|View 295|This document|India in 2026/i.test(n))).toBe(
      false,
    );
  });
});

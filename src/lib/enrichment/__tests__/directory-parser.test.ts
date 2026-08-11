import { describe, expect, it } from "vitest";
import {
  cleanCompanyName,
  isPlausibleCompanyName,
  parseCompaniesFromDirectoryResults,
} from "@/lib/enrichment/directory-parser";

describe("cleanCompanyName / isPlausibleCompanyName", () => {
  it("rejects job posts, documents, report titles, and geo names", () => {
    const junk = [
      "IT and operations. Samsara is Hiring",
      "View 295 Jobs ### Navan",
      "This document contains a list of company addresses in Bengaluru",
      "India in 2026",
      "Browse top technology companies",
      "Find business near me",
      "Karnataka",
      "Bengaluru",
      "Maharashtra",
      "India",
      "Companies in Karnataka",
      "Work Satisfaction",
      "Company Culture",
      "Salary",
      "Reviews",
      "Work Life Balance",
      "Hosur-635126",
      "Hosur 635126",
      "Hosur No 122",
      "HosurPlot No 63",
      "Hosur20/2d",
      "Sipcot Industrial Complex",
      "Industrial Complex",
      "Hoskote Industrial Area",
      "Anumepalli Agraharam Village",
      "Krishnagiri",
      "Hosur",
      "PHASE-I",
      "PHASE-II",
      "VENKATESA NAGAR KRISHNAGIRI ROAD",
      "KARNOOR",
      "HOSUR TO THALLY ROAD",
      "KRISHNA GROUP COMPOUND",
      "SIPCOT POST",
      "SIDCO INDL. ESTATE",
      "Rajeshwari Layout",
      "Hanumapalli",
      "Begapalli Road",
      "KRISHNAGIRI ROAD",
      "100 INR (Approx.)",
      "1.2mm Metal Name Plate",
      "Air Purifiers",
      "Sharp Air Purifier",
      "Solar Water Pumping Systems 1HP to 20HP",
      "Company SubCategory",
      "Indian Non-Government Company",
      "Company Class",
      "Private Company",
      "Filing Status For Last 2 Years",
      "Email ID",
      "Address",
      "Tax",
    ];
    for (const name of junk) {
      expect(isPlausibleCompanyName(name), name).toBe(false);
      expect(cleanCompanyName(name), name).toBeNull();
    }
  });

  it("keeps real plant companies even when SIPCOT appears in the title", () => {
    expect(isPlausibleCompanyName("Maryland Mechanical India PVT LTD Sipcot")).toBe(true);
    expect(isPlausibleCompanyName("VERTEX AUTO COMPONENTS")).toBe(true);
    expect(isPlausibleCompanyName("Delta Electronics India Pvt Ltd")).toBe(true);
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

  it("extracts employee counts from listing text", () => {
    const results = parseCompaniesFromDirectoryResults(
      [
        {
          title: "Hikal Ltd | Company Profile",
          url: "https://www.indiamart.com/hikal-ltd",
          content: "API manufacturer in Bengaluru with 1,200 employees and a corporate office.",
        },
      ],
      ["Bengaluru"],
      10,
    );
    expect(results[0]?.name).toBe("Hikal Ltd");
    expect(results[0]?.employees).toMatch(/1,200/i);
  });

  it("does not treat AmbitionBox review headings as companies", () => {
    const results = parseCompaniesFromDirectoryResults(
      [
        {
          title: "Razorpay Reviews | AmbitionBox",
          url: "https://www.ambitionbox.com/overview/razorpay-reviews",
          content:
            "Work Satisfaction · Company Culture · Salary · Job Security · Work Life Balance · Skill Development",
        },
        {
          title: "StartupBlink | Company Profile",
          url: "https://www.startupblink.com/startups/razorpay",
          content: "Startup ecosystem directory · Bengaluru",
        },
      ],
      ["Bengaluru"],
      10,
    );

    const names = results.map((r) => r.name);
    expect(names).toContain("Razorpay");
    expect(names.some((n) => /work satisfaction|company culture|^salary$|job security/i.test(n))).toBe(
      false,
    );
  });
});

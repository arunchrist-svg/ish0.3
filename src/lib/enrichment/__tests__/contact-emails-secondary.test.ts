import { describe, expect, it } from "vitest";
import {
  buildFirstLastSecondaryEmail,
  hasUsableContactEmail,
  hasUsableEmail,
  refreshPermutationEmails,
  shouldSuggestWriteEmail,
  withFirstLastSecondaryEmail,
} from "@/lib/enrichment/contact-emails";

describe("first.last secondary email", () => {
  it("builds firstname.lastname@company domain when primary differs", () => {
    const secondary = buildFirstLastSecondaryEmail({
      firstName: "Priya",
      lastName: "Sharma",
      domain: "acme.in",
      primaryEmail: "p.sharma@acme.in",
    });

    expect(secondary).toMatchObject({
      email: "priya.sharma@acme.in",
      pattern: "first.last",
      enrichmentProvider: "permutation",
      testStatus: "saved",
    });
  });

  it("returns null when primary already matches first.last", () => {
    const secondary = buildFirstLastSecondaryEmail({
      firstName: "Priya",
      lastName: "Sharma",
      domain: "acme.in",
      primaryEmail: "priya.sharma@acme.in",
    });

    expect(secondary).toBeNull();
  });

  it("parses full name when first/last missing", () => {
    const secondary = buildFirstLastSecondaryEmail({
      name: "Arun Murugesan",
      website: "https://www.indiasweethouse.com",
      primaryEmail: "arun@indiasweethouse.com",
    });

    expect(secondary?.email).toBe("arun.murugesan@indiasweethouse.com");
  });

  it("merges secondary into alternate emails without duplicating primary", () => {
    const alternates = withFirstLastSecondaryEmail(
      "ceo@acme.com",
      [{ email: "other@acme.com", emailStatus: "unverified" }],
      {
        firstName: "Jane",
        lastName: "Doe",
        domain: "acme.com",
      },
    );

    expect(alternates.map((e) => e.email)).toEqual(
      expect.arrayContaining(["jane.doe@acme.com", "other@acme.com"]),
    );
    expect(alternates.some((e) => e.email === "ceo@acme.com")).toBe(false);
  });
});

describe("refreshPermutationEmails", () => {
  it("skips promoting first.last when fillPermutationPrimary is false", () => {
    const next = refreshPermutationEmails({
      firstName: "Priya",
      lastName: "Sharma",
      companyName: "Acme Corp",
      domain: "acme.in",
      primaryEmail: null,
      fillPermutationPrimary: false,
      alternateEmails: [],
    });

    expect(next.email).toBeNull();
    expect(next.emailStatus).toBe("missing");
    expect(next.enrichmentProvider).toBeNull();
  });

  it("drops a competitor-domain guess for Tata Steel", () => {
    const next = refreshPermutationEmails({
      firstName: "Sandeep",
      lastName: "Yadav",
      companyName: "Tata Steel",
      domain: "jindalsteel.in",
      website: "https://www.jindalsteel.in",
      primaryEmail: null,
      alternateEmails: [
        {
          email: "sandeep.yadav@jindalsteel.in",
          emailStatus: "unverified",
          enrichmentProvider: "permutation",
          enrichmentSource: "name_domain_guess",
          pattern: "first.last",
        },
      ],
    });

    expect(next.email).toBe("sandeep.yadav@tatasteel.com");
    expect(next.alternateEmails.some((entry) => entry.email.includes("jindalsteel"))).toBe(false);
  });

  it("drops a verified competitor email, not only permutation guesses", () => {
    const next = refreshPermutationEmails({
      firstName: "Sandeep",
      lastName: "Yadav",
      companyName: "Tata Steel",
      domain: "tatasteel.com",
      primaryEmail: "sandeep.yadav@jindalsteel.in",
      emailStatus: "verified",
      enrichmentProvider: "hunter",
      enrichmentSource: "hunter",
      alternateEmails: [
        {
          email: "sandeep.yadav@jindalsteel.in",
          emailStatus: "verified",
          enrichmentProvider: "hunter",
        },
      ],
    });

    expect(next.email).toBe("sandeep.yadav@tatasteel.com");
    expect(next.alternateEmails.some((entry) => entry.email.includes("jindalsteel"))).toBe(false);
  });

  it("replaces publisher-domain guesses with the company domain", () => {
    const next = refreshPermutationEmails({
      firstName: "Pallavi",
      lastName: "Gupta",
      companyName: "Pavna Industries",
      domain: "pavnagroup.com",
      website: "https://www.pavna.in",
      primaryEmail: null,
      alternateEmails: [
        {
          email: "pallavi.gupta@manufacturingtodayindia.com",
          emailStatus: "unverified",
          enrichmentProvider: "permutation",
          enrichmentSource: "name_domain_guess",
          pattern: "first.last",
        },
      ],
    });

    expect(next.email).toBe("pallavi.gupta@pavnagroup.com");
    expect(next.alternateEmails.some((entry) => entry.email.includes("manufacturingtodayindia"))).toBe(false);
  });

  it("rewrites Automotive Axles slug guesses to autoaxle.com", () => {
    const next = refreshPermutationEmails({
      firstName: "Emmanuel",
      lastName: "Suresh Kumar",
      companyName: "AUTOMOTIVE AXLES LIMITED",
      primaryEmail: "emmanuel.sureshkumar@automotiveaxles.com",
      emailStatus: "unverified",
      enrichmentProvider: "permutation",
      enrichmentSource: "name_domain_guess:first.last",
      alternateEmails: [],
    });

    expect(next.email).toBe("emmanuel.sureshkumar@autoaxle.com");
    expect(next.emailStatus).toBe("unverified");
  });

  it("keeps a user-typed email that does not match the company domain", () => {
    const next = refreshPermutationEmails({
      firstName: "Prasanth",
      companyName: "ish",
      primaryEmail: "prasanth@example-corp.com",
      emailStatus: "unverified",
      enrichmentProvider: "manual",
      enrichmentSource: "manual",
      preservePrimary: true,
      alternateEmails: [],
    });
    expect(next.email).toBe("prasanth@example-corp.com");
    expect(next.enrichmentProvider).toBe("manual");
  });

  it("does not revive a bounced first.last address", () => {
    const next = refreshPermutationEmails({
      firstName: "Priya",
      lastName: "Sharma",
      companyName: "Acme",
      domain: "acme.com",
      primaryEmail: null,
      alternateEmails: [
        {
          email: "priya.sharma@acme.com",
          emailStatus: "bounced",
          enrichmentProvider: "permutation",
          testStatus: "rejected",
          pattern: "first.last",
        },
      ],
    });

    expect(next.email).toBeNull();
    expect(next.alternateEmails.some((entry) => entry.email === "priya.sharma@acme.com" && entry.testStatus === "rejected")).toBe(true);
  });

  it("keeps a mapped Gmail address that does not match the company domain", () => {
    const next = refreshPermutationEmails({
      firstName: "Abgupta",
      name: "Abgupta",
      companyName: "ABHIJIT GUPTA",
      primaryEmail: "abgupta89@gmail.com",
      emailStatus: "unverified",
      alternateEmails: [],
    });

    expect(next.email).toBe("abgupta89@gmail.com");
    expect(next.emailStatus).toBe("unverified");
  });
});

describe("hasUsableContactEmail", () => {
  it("treats an unverified primary email as usable for outreach", () => {
    expect(
      hasUsableContactEmail({
        email: "vijetha.gowda@seg-automotive.com",
        emailStatus: "unverified",
      }),
    ).toBe(true);
  });

  it("uses saved/suggested emails when primary is missing", () => {
    expect(
      hasUsableContactEmail({
        email: "—",
        emailStatus: "missing",
        emails: [
          {
            email: "vijetha.gowda@seg-automotive.com",
            emailStatus: "unverified",
          },
        ],
      }),
    ).toBe(true);
  });

  it("does not treat bounced emails as usable", () => {
    expect(hasUsableEmail("priya.sharma@acme.com", "bounced")).toBe(false);
    expect(
      hasUsableContactEmail({
        email: null,
        emailStatus: "missing",
        emails: [{ email: "priya.sharma@acme.com", emailStatus: "bounced", testStatus: "rejected" }],
      }),
    ).toBe(false);
  });

  it("does not treat generic-only emails as usable", () => {
    expect(
      hasUsableContactEmail({
        email: "info@seg-automotive.com",
        emailStatus: "generic",
        emails: [{ email: "sales@seg-automotive.com", emailStatus: "generic" }],
      }),
    ).toBe(false);
  });

  it("suggests write email when any listed address is usable", () => {
    expect(
      shouldSuggestWriteEmail(
        "—",
        "missing",
        "scouted",
        false,
        [{ email: "vijetha.gowda@seg-automotive.com", emailStatus: "unverified" }],
      ),
    ).toBe(true);
  });
});

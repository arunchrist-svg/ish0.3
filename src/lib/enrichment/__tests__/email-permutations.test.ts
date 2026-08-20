import { describe, expect, it } from "vitest";
import {
  generateEmailPermutations,
  generateEmailPermutationsForContact,
  isValidPermutationForContact,
  normalizeDomain,
  normalizeNamePart,
  resolveAccountDomain,
  suggestionsAfterDomainChange,
} from "@/lib/enrichment/email-permutations";

describe("email-permutations", () => {
  it("generates standard B2B patterns for first and last name", () => {
    const suggestions = generateEmailPermutations({
      firstName: "John",
      lastName: "Smith",
      domain: "acme.com",
    });

    expect(suggestions.map((s) => s.email)).toEqual([
      "john.smith@acme.com",
      "johnsmith@acme.com",
      "jsmith@acme.com",
      "j.smith@acme.com",
      "john@acme.com",
      "smith.john@acme.com",
      "john_smith@acme.com",
      "smith@acme.com",
    ]);
  });

  it("dedupes identical local parts", () => {
    const suggestions = generateEmailPermutations({
      firstName: "Ann",
      lastName: "Ann",
      domain: "acme.com",
    });

    const emails = suggestions.map((s) => s.email);
    expect(new Set(emails).size).toBe(emails.length);
  });

  it("normalizes diacritics and punctuation in names", () => {
    expect(normalizeNamePart("José")).toBe("jose");
    expect(normalizeNamePart("O'Brien")).toBe("obrien");
  });

  it("generates first-only pattern when last name is missing", () => {
    const suggestions = generateEmailPermutations({
      firstName: "Madonna",
      lastName: "",
      domain: "acme.com",
    });

    expect(suggestions).toEqual([
      { email: "madonna@acme.com", pattern: "first", localPart: "madonna" },
    ]);
  });

  it("resolves domain from website then company name", () => {
    expect(
      resolveAccountDomain({
        domain: null,
        website: "https://www.example.co.uk/about",
        companyName: "Example Ltd",
      }),
    ).toBe("example.co.uk");

    expect(
      resolveAccountDomain({
        domain: null,
        website: null,
        companyName: "Acme Corp",
      }),
    ).toBe("acme.com");

    expect(
      resolveAccountDomain({
        domain: "manufacturingtodayindia.com",
        website: "https://www.manufacturingtodayindia.com/story",
        companyName: "Pavna Industries",
      }),
    ).toBe("pavnaindustries.com");
  });

  it("returns error when domain cannot be resolved", () => {
    const result = generateEmailPermutationsForContact({
      firstName: "John",
      lastName: "Smith",
      companyName: "",
    });

    expect(result).toEqual({
      error: "Could not resolve company domain. Add a website or domain on the account.",
    });
  });

  it("validates saved emails against generated permutations", () => {
    const input = {
      firstName: "John",
      lastName: "Smith",
      domain: "acme.com",
    };

    expect(isValidPermutationForContact("john.smith@acme.com", input)).toBe(true);
    expect(isValidPermutationForContact("random@acme.com", input)).toBe(false);
  });

  it("strips protocol, www, and paths from a typed or pasted domain", () => {
    expect(normalizeDomain("https://www.autoaxle.com/")).toBe("autoaxle.com");
    expect(normalizeDomain("http://www.autoaxle.com/about?ref=1")).toBe("autoaxle.com");
    expect(normalizeDomain("www.autoaxle.com")).toBe("autoaxle.com");
    expect(normalizeDomain("AUTOAXLE.COM")).toBe("autoaxle.com");
    expect(normalizeDomain("")).toBeUndefined();
    expect(normalizeDomain("not a domain")).toBeUndefined();
    expect(normalizeDomain("goto")).toBeUndefined();
    expect(normalizeDomain("emmanuel@autoaxle.com")).toBeUndefined();
  });

  it("regenerates guesses when the domain is edited and keeps matching selections", () => {
    const fromWrongHost = generateEmailPermutations({
      firstName: "Emmanuel",
      lastName: "Suresh Kumar",
      domain: "automotiveaxles.com",
    });
    expect(fromWrongHost[0]?.email).toBe("emmanuel.sureshkumar@automotiveaxles.com");

    const next = suggestionsAfterDomainChange({
      firstName: "Emmanuel",
      lastName: "Suresh Kumar",
      domain: "https://www.autoaxle.com/",
      selected: [fromWrongHost[0]!.email, fromWrongHost[2]!.email],
      primaryEmail: fromWrongHost[0]!.email,
    });

    expect(next.domain).toBe("autoaxle.com");
    expect(next.suggestions.map((item) => item.email)).toEqual([
      "emmanuel.sureshkumar@autoaxle.com",
      "emmanuelsureshkumar@autoaxle.com",
      "esureshkumar@autoaxle.com",
      "e.sureshkumar@autoaxle.com",
      "emmanuel@autoaxle.com",
      "sureshkumar.emmanuel@autoaxle.com",
      "emmanuel_sureshkumar@autoaxle.com",
      "sureshkumar@autoaxle.com",
    ]);
    expect(next.selected).toEqual([
      "emmanuel.sureshkumar@autoaxle.com",
      "esureshkumar@autoaxle.com",
    ]);
    expect(next.primaryEmail).toBe("emmanuel.sureshkumar@autoaxle.com");
  });

  it("does not generate emails for empty or unusable domains", () => {
    expect(
      generateEmailPermutations({
        firstName: "Emmanuel",
        lastName: "Kumar",
        domain: "",
      }),
    ).toEqual([]);
    expect(
      suggestionsAfterDomainChange({
        firstName: "Emmanuel",
        lastName: "Kumar",
        domain: "linkedin.com",
        selected: ["emmanuel.kumar@automotiveaxles.com"],
        primaryEmail: "emmanuel.kumar@automotiveaxles.com",
      }),
    ).toEqual({ domain: undefined, suggestions: [], selected: [], primaryEmail: "" });
  });
});

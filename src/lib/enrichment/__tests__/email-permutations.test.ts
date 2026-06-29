import { describe, expect, it } from "vitest";
import {
  generateEmailPermutations,
  generateEmailPermutationsForContact,
  isValidPermutationForContact,
  normalizeNamePart,
  resolveAccountDomain,
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
});

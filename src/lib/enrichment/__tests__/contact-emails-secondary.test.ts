import { describe, expect, it } from "vitest";
import {
  buildFirstLastSecondaryEmail,
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

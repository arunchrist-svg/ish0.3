import { describe, expect, it } from "vitest";
import {
  buildManagedEmailCandidates,
  buildSavedEmailCandidates,
} from "@/lib/enrichment/email-candidate-queue";
import type { ContactEmailEntry } from "@/lib/enrichment/contact-emails";

describe("buildManagedEmailCandidates", () => {
  it("returns null primary when the list is empty (delete all)", () => {
    const result = buildManagedEmailCandidates([], undefined);
    expect(result.primary).toBeNull();
    expect(result.alternates).toEqual([]);
  });

  it("dedupes and uses the first email as primary when none is set", () => {
    const result = buildManagedEmailCandidates(
      ["a@acme.com", "A@acme.com", "b@acme.com"],
      undefined,
    );
    expect(result.primary?.email).toBe("a@acme.com");
    expect(result.alternates.map((e) => e.email)).toEqual(["b@acme.com"]);
    expect(result.primary?.pattern).toBe("custom");
    expect(result.primary?.enrichmentProvider).toBe("manual");
  });

  it("honors an explicit primary and preserves existing metadata", () => {
    const existing: ContactEmailEntry[] = [
      {
        email: "keep@acme.com",
        emailStatus: "verified",
        emailConfidence: 90,
        enrichmentProvider: "hunter",
        enrichmentSource: "hunter",
        testStatus: "sent",
        pattern: "first.last",
      },
    ];
    const patterns = new Map([["keep@acme.com", "first.last"]]);
    const result = buildManagedEmailCandidates(
      ["new@acme.com", "keep@acme.com"],
      "keep@acme.com",
      { patternByEmail: patterns, existing },
    );

    expect(result.primary?.email).toBe("keep@acme.com");
    expect(result.primary?.emailStatus).toBe("verified");
    expect(result.primary?.emailConfidence).toBe(90);
    expect(result.primary?.pattern).toBe("first.last");
    expect(result.alternates).toHaveLength(1);
    expect(result.alternates[0].email).toBe("new@acme.com");
    expect(result.alternates[0].pattern).toBe("custom");
  });

  it("falls back to first email when primary is not in the list", () => {
    const result = buildManagedEmailCandidates(
      ["a@acme.com", "b@acme.com"],
      "missing@acme.com",
    );
    expect(result.primary?.email).toBe("a@acme.com");
    expect(result.alternates.map((e) => e.email)).toEqual(["b@acme.com"]);
  });

  it("revives rejected testStatus to saved on re-add", () => {
    const existing: ContactEmailEntry[] = [
      {
        email: "retry@acme.com",
        emailStatus: "unverified",
        testStatus: "rejected",
        pattern: "custom",
      },
    ];
    const result = buildManagedEmailCandidates(["retry@acme.com"], undefined, { existing });
    expect(result.primary?.testStatus).toBe("saved");
  });
});

describe("buildSavedEmailCandidates", () => {
  it("still builds permutation entries for suggest save", () => {
    const patterns = new Map([
      ["jane.doe@acme.com", "first.last"],
      ["jdoe@acme.com", "flast"],
    ]);
    const result = buildSavedEmailCandidates(
      ["jane.doe@acme.com", "jdoe@acme.com"],
      "jane.doe@acme.com",
      patterns,
    );
    expect(result.primary.email).toBe("jane.doe@acme.com");
    expect(result.primary.pattern).toBe("first.last");
    expect(result.alternates[0].pattern).toBe("flast");
  });
});

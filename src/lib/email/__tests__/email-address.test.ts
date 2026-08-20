import { describe, expect, it } from "vitest";
import { extractEmailAddress, extractEmailAddresses, normalizeEmailSubject } from "@/lib/email/email-address";

describe("extractEmailAddress", () => {
  it("reads a bare address", () => {
    expect(extractEmailAddress("Venkatesan.A@Tenneco.com")).toBe("venkatesan.a@tenneco.com");
  });

  it("reads Name <address> webhook To values", () => {
    expect(extractEmailAddress("Venkatesan A <venkatesan.a@tenneco.com>")).toBe("venkatesan.a@tenneco.com");
  });

  it("dedupes a mixed To list", () => {
    expect(
      extractEmailAddresses(["Ambrose <ambrose.joseph@tennecoindia.com>", "ambrose.joseph@tennecoindia.com"]),
    ).toEqual(["ambrose.joseph@tennecoindia.com"]);
  });
});

describe("normalizeEmailSubject", () => {
  it("collapses whitespace for matching", () => {
    expect(normalizeEmailSubject("  A tasting box   for your team ")).toBe("a tasting box for your team");
  });
});

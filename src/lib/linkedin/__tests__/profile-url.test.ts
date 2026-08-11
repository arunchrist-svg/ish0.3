import { describe, expect, it } from "vitest";
import { parseTeamLinkedIn } from "../profile-url";

describe("parseTeamLinkedIn", () => {
  it("normalizes a profile URL", () => {
    expect(parseTeamLinkedIn("linkedin.com/in/arun-murugesan")).toBe(
      "https://linkedin.com/in/arun-murugesan",
    );
  });

  it("clears blank values", () => {
    expect(parseTeamLinkedIn("")).toBeNull();
    expect(parseTeamLinkedIn("   ")).toBeNull();
    expect(parseTeamLinkedIn(null)).toBeNull();
  });

  it("rejects non-profile URLs", () => {
    expect(() => parseTeamLinkedIn("https://example.com/arun")).toThrow(/linkedin.com\/in/);
  });
});

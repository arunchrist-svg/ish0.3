import { describe, expect, it } from "vitest";

import {
  getLeadabilityLabel,
  getLeadabilitySummary,
  getLeadabilityTooltip,
} from "@/lib/scout/leadability";

describe("leadability presentation", () => {
  it("maps ranked bands to user-facing labels", () => {
    expect(getLeadabilityLabel("high")).toBe("High lead chance");
    expect(getLeadabilityLabel("medium")).toBe("Medium lead chance");
    expect(getLeadabilityLabel("low")).toBe("Low lead chance");
    expect(getLeadabilityLabel("unknown")).toBeNull();
  });

  it("summarizes matched buyers and city signals concisely", () => {
    expect(
      getLeadabilitySummary({
        leadabilityBand: "high",
        leadabilityMatchedPeople: 2,
        leadabilityMatchedInCity: 1,
      }),
    ).toBe("2 matching buyers, 1 in city");
  });

  it("falls back to the score when only ranked confidence is available", () => {
    expect(
      getLeadabilitySummary({
        leadabilityBand: "medium",
        leadabilityScore: 52.2,
      }),
    ).toBe("Leadability score 52");
  });

  it("includes source context in the tooltip copy", () => {
    expect(
      getLeadabilityTooltip({
        leadabilityBand: "high",
        leadabilityMatchedPeople: 1,
        leadabilityProbeSource: "probe",
      }),
    ).toBe("High lead chance. 1 matching buyer found. Source: probe");
  });
});

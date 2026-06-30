import { describe, expect, it } from "vitest";
import {
  passesOutreachQuality,
  draftFailsQualityGate,
  DELIVERABILITY_PASS_THRESHOLD,
  RUBRIC_PASS_THRESHOLD,
} from "@/lib/agents/quality-gate";

describe("quality-gate", () => {
  it("passes when both scores meet threshold", () => {
    expect(passesOutreachQuality(DELIVERABILITY_PASS_THRESHOLD, RUBRIC_PASS_THRESHOLD)).toBe(true);
  });

  it("fails when rubric is below threshold", () => {
    expect(passesOutreachQuality(90, RUBRIC_PASS_THRESHOLD - 1)).toBe(false);
  });

  it("draftFailsQualityGate flags revisionTimeout", () => {
    expect(draftFailsQualityGate({ revisionTimeout: true, deliverabilityScore: 90, rubricTotal: 90 })).toBe(true);
  });

  it("draftFailsQualityGate passes when scores are stored and good", () => {
    expect(draftFailsQualityGate({ revisionTimeout: false, deliverabilityScore: 85, rubricTotal: 85 })).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import {
  DELIVERABILITY_PASS_THRESHOLD,
  RUBRIC_PASS_THRESHOLD,
  describeQualityBlock,
  draftFailsQualityGate,
  passesOutreachQuality,
} from "../outreach-quality";

describe("outreach-quality", () => {
  it("passes when both scores meet threshold", () => {
    expect(passesOutreachQuality(DELIVERABILITY_PASS_THRESHOLD, RUBRIC_PASS_THRESHOLD)).toBe(true);
  });

  it("fails when rubric is below threshold", () => {
    expect(passesOutreachQuality(90, RUBRIC_PASS_THRESHOLD - 1)).toBe(false);
  });

  it("draftFailsQualityGate flags revisionTimeout", () => {
    expect(draftFailsQualityGate({ revisionTimeout: true, deliverabilityScore: 90, rubricTotal: 90 })).toBe(true);
  });

  it("describeQualityBlock mentions revision timeout", () => {
    expect(describeQualityBlock({ revisionTimeout: true })).toMatch(/improve this draft/);
  });
});

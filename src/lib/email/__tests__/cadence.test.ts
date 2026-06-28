import { describe, expect, it } from "vitest";
import {
  cadenceSummary,
  emailStepLabel,
  isEmailSentForStep,
  normalizeCadenceDays,
  sequenceStepDays,
} from "@/lib/email/cadence";

describe("cadence", () => {
  it("normalizes cadence days", () => {
    expect(normalizeCadenceDays([4, 8])).toEqual([4, 8]);
    expect(normalizeCadenceDays([])).toEqual([3, 7]);
  });

  it("builds sequence step days", () => {
    expect(sequenceStepDays([4, 8])).toEqual([0, 4, 8]);
  });

  it("labels email steps", () => {
    expect(emailStepLabel(0, [4, 8])).toBe("Email 1");
    expect(emailStepLabel(4, [4, 8])).toBe("Email 2");
  });

  it("summarizes cadence for UI copy", () => {
    expect(cadenceSummary([4, 8])).toContain("Day 4");
  });

  it("tracks sent steps", () => {
    expect(isEmailSentForStep(4, 4)).toBe(true);
    expect(isEmailSentForStep(0, 4)).toBe(false);
  });
});

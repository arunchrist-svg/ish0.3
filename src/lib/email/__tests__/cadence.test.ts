import { describe, expect, it } from "vitest";
import {
  cadenceSummary,
  emailLabelForDraftPosition,
  emailStepLabel,
  isEmailSentForStep,
  normalizeCadenceDays,
  sequenceDayForDraftPosition,
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
    expect(emailStepLabel(-2)).toBe("Their reply");
    expect(emailStepLabel(-1)).toBe("Your reply");
  });

  it("summarizes cadence for UI copy", () => {
    expect(cadenceSummary([4, 8])).toContain("Day 4");
  });

  it("tracks sent steps", () => {
    expect(isEmailSentForStep(4, 4)).toBe(true);
    expect(isEmailSentForStep(0, 4)).toBe(false);
  });

  it("maps draft positions to sequence days and labels", () => {
    expect(sequenceDayForDraftPosition(1, [3, 7])).toBe(0);
    expect(sequenceDayForDraftPosition(2, [3, 7])).toBe(3);
    expect(sequenceDayForDraftPosition(3, [4, 8])).toBe(8);
    expect(sequenceDayForDraftPosition(5)).toBe(5);
    expect(emailLabelForDraftPosition(3)).toBe("Email 3");
    expect(emailLabelForDraftPosition(5)).toBe("If Opened");
  });
});

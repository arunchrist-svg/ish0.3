/** Single source of truth for outreach sequence day labels in the UI. */
export type CadenceDays = [number, number];

export const DEFAULT_CADENCE_DAYS: CadenceDays = [3, 7];

export function normalizeCadenceDays(input?: number[] | null): CadenceDays {
  if (input && input.length >= 2 && input.every((d) => Number.isFinite(d) && d > 0)) {
    return [Math.round(input[0]), Math.round(input[1])];
  }
  return DEFAULT_CADENCE_DAYS;
}

/** Sequence step days: Email 1 = 0, follow-ups use configured cadence. */
export function sequenceStepDays(cadence: CadenceDays): [number, number, number] {
  return [0, cadence[0], cadence[1]];
}

export function emailStepLabel(sequenceDay: number, cadence?: CadenceDays): string {
  const [d0, d1, d2] = sequenceStepDays(normalizeCadenceDays(cadence));
  if (sequenceDay === d0) return "Email 1";
  if (sequenceDay === d1) return "Email 2";
  if (sequenceDay === d2) return "Email 3";
  if (sequenceDay === 0) return "Email 1";
  return `Day ${sequenceDay}`;
}

export function cadenceSummary(cadence?: CadenceDays): string {
  const [d1, d2] = normalizeCadenceDays(cadence);
  return `Follow-ups send automatically on Day ${d1} and Day ${d2}`;
}

export function isFollowUpDay(sequenceDay: number, cadence?: CadenceDays): boolean {
  const [, d1, d2] = sequenceStepDays(normalizeCadenceDays(cadence));
  return sequenceDay === d1 || sequenceDay === d2;
}

export function isEmailSentForStep(lastEmailDay: number, stepDay: number): boolean {
  if (stepDay === 0) return lastEmailDay >= 0;
  return lastEmailDay >= stepDay;
}

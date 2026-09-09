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
  if (sequenceDay === -2) return "Their reply";
  if (sequenceDay === -1) return "Your reply";
  const [d0, d1, d2] = sequenceStepDays(normalizeCadenceDays(cadence));
  if (sequenceDay === d0) return "Email 1";
  if (sequenceDay === d1) return "Email 2";
  if (sequenceDay === d2) return "Email 3";
  if (sequenceDay === 0) return "Email 1";
  return `Day ${sequenceDay}`;
}

/** Map draft sequence_position (1/2/3/5) to outreach_schedule.sequence_day. */
export function sequenceDayForDraftPosition(
  sequencePosition: number,
  cadence?: CadenceDays | number[] | null,
): number | null {
  if (sequencePosition === 1) return 0;
  const [d1, d2] = normalizeCadenceDays(cadence);
  if (sequencePosition === 2) return d1;
  if (sequencePosition === 3) return d2;
  // If Opened catalog uses day 5 (see promote-catalog-on-open).
  if (sequencePosition === 5) return 5;
  return null;
}

export function emailLabelForDraftPosition(sequencePosition: number): string | null {
  if (sequencePosition === 1) return "Email 1";
  if (sequencePosition === 2) return "Email 2";
  if (sequencePosition === 3) return "Email 3";
  if (sequencePosition === 5) return "If Opened";
  return null;
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

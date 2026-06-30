import {
  DELIVERABILITY_PASS_THRESHOLD,
  RUBRIC_PASS_THRESHOLD,
} from "@/lib/agents/writer-scoring";

export { DELIVERABILITY_PASS_THRESHOLD, RUBRIC_PASS_THRESHOLD };

export type OutreachQualityFields = {
  revisionTimeout?: boolean | null;
  deliverabilityScore?: number | null;
  rubricTotal?: number | null;
};

export function passesOutreachQuality(delivScore: number, rubricTotal: number): boolean {
  return delivScore >= DELIVERABILITY_PASS_THRESHOLD && rubricTotal >= RUBRIC_PASS_THRESHOLD;
}

export function draftFailsQualityGate(outreach: OutreachQualityFields): boolean {
  if (outreach.revisionTimeout) return true;
  if (outreach.deliverabilityScore == null || outreach.rubricTotal == null) return false;
  return !passesOutreachQuality(outreach.deliverabilityScore, outreach.rubricTotal);
}

export function describeQualityBlock(outreach: OutreachQualityFields): string {
  if (outreach.revisionTimeout) {
    return "Writer could not improve this draft in time. Send anyway?";
  }
  const deliv = outreach.deliverabilityScore ?? 0;
  const rubric = outreach.rubricTotal ?? 0;
  return (
    `This draft scored below quality thresholds (inbox ${deliv}, rubric ${rubric}). ` +
    "Send anyway?"
  );
}

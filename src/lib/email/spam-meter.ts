export {
  scoreContentQuality,
  scoreInboxSafety,
  contentQualityLabel,
  spamMeterLabel,
  type ContentQualityResult,
  type ContentQualityOptions,
  type ContentFactor,
  type ContentQualityVerdict,
} from "@/lib/email/content-quality-score";

export type SpamFactor = { label: string; delta: number; ruleId?: string };
export type SpamMeterVerdict = import("@/lib/email/content-quality-score").ContentQualityVerdict;
export type SpamMeterResult = import("@/lib/email/content-quality-score").ContentQualityResult;

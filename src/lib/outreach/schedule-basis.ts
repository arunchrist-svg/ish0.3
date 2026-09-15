import type { EmailConfig } from "@/lib/email/config";
import { recommendedDailyCap } from "@/lib/email/sender-warmup";
import { normalizeSendHourRanges } from "@/lib/email/send-window";

/** Settings that change how Email 1 queue slots are planned. */
export type ScheduleBasisFields = Pick<
  EmailConfig,
  | "dailySendCapPerDomain"
  | "inboxWarmupStage"
  | "inboxWarmupStartedAt"
  | "sendDaysOfWeek"
  | "sendHourStart"
  | "sendHourEnd"
  | "sendHourRanges"
  | "sendTimezone"
>;

export function effectiveDailySendCap(config: ScheduleBasisFields): number {
  const rec = recommendedDailyCap({
    stage: config.inboxWarmupStage,
    warmupStartedAt: config.inboxWarmupStartedAt,
  });
  return config.dailySendCapPerDomain ?? rec.recommended;
}

/**
 * Stable fingerprint of send-window + daily-cap inputs.
 * Any change should re-space the queued Email 1 list from now.
 */
export function scheduleBasisFingerprint(config: ScheduleBasisFields): string {
  const ranges = normalizeSendHourRanges(
    config.sendHourRanges,
    config.sendHourStart ?? 9,
    config.sendHourEnd ?? 17,
  );
  const days = [...(config.sendDaysOfWeek ?? [])].map(Number).sort((a, b) => a - b);
  return JSON.stringify({
    dailyCap: effectiveDailySendCap(config),
    stage: config.inboxWarmupStage ?? "new",
    days,
    ranges: ranges.map((r) => [r.hourStart, r.hourEnd]),
    timezone: config.sendTimezone ?? "Asia/Kolkata",
  });
}

export function scheduleBasisChanged(
  before: ScheduleBasisFields,
  after: ScheduleBasisFields,
): boolean {
  return scheduleBasisFingerprint(before) !== scheduleBasisFingerprint(after);
}

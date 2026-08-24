export type InboxWarmupStage = "new" | "warming" | "trusted";

/** Conservative mailbox warmup: new inboxes 20–40/day, ramp 2–4 weeks, trusted 100–150/day. */
export const MAILBOX_WARMUP = {
  newMin: 20,
  newMax: 40,
  newDefault: 30,
  warmingDefault: 60,
  trustedMin: 100,
  trustedMax: 150,
  trustedDefault: 120,
  newStageDays: 14,
  trustedAfterDays: 28,
  dayOverDayGrowth: 0.3,
  minDailyStep: 10,
  burstSize: 40,
  hardCapMax: 500,
} as const;

export const INBOX_WARMUP_STAGE_OPTIONS: {
  value: InboxWarmupStage;
  label: string;
  desc: string;
}[] = [
  {
    value: "new",
    label: "New",
    desc: "First 2 weeks. Stay at 20–40 emails per day.",
  },
  {
    value: "warming",
    label: "Warming",
    desc: "Weeks 2–4. Raise volume gradually toward 100/day.",
  },
  {
    value: "trusted",
    label: "Warmed",
    desc: "Mailbox has been sending steadily. Safe cap is 100–150 per day.",
  },
];

export function remainingDailyQuota(sendsLast24h: number, dailyCap: number): number {
  return Math.max(0, dailyCap - Math.max(0, sendsLast24h));
}

export function clampDailySendCap(raw: number | undefined, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(MAILBOX_WARMUP.hardCapMax, Math.round(n)));
}

export function warmupDayIndex(startedAt: string | undefined, now = Date.now()): number {
  if (!startedAt) return 0;
  const start = new Date(startedAt).getTime();
  if (!Number.isFinite(start)) return 0;
  return Math.max(0, Math.floor((now - start) / (24 * 60 * 60 * 1000)));
}

export function inferWarmupStage(
  dayIndex: number,
  explicit?: InboxWarmupStage | null,
): InboxWarmupStage {
  if (explicit === "new" || explicit === "warming" || explicit === "trusted") return explicit;
  if (dayIndex < MAILBOX_WARMUP.newStageDays) return "new";
  if (dayIndex < MAILBOX_WARMUP.trustedAfterDays) return "warming";
  return "trusted";
}

export type WarmupRecommendation = {
  stage: InboxWarmupStage;
  dayIndex: number;
  recommended: number;
  min: number;
  max: number;
};

function lerp(from: number, to: number, t: number): number {
  return Math.round(from + (to - from) * Math.min(1, Math.max(0, t)));
}

export function recommendedDailyCap(params: {
  stage?: InboxWarmupStage | null;
  warmupStartedAt?: string;
  now?: number;
}): WarmupRecommendation {
  const dayIndex = warmupDayIndex(params.warmupStartedAt, params.now);
  const stage = inferWarmupStage(dayIndex, params.stage);

  if (stage === "new") {
    const t = MAILBOX_WARMUP.newStageDays <= 1 ? 1 : dayIndex / (MAILBOX_WARMUP.newStageDays - 1);
    return {
      stage,
      dayIndex,
      recommended: lerp(MAILBOX_WARMUP.newMin, MAILBOX_WARMUP.newMax, t),
      min: MAILBOX_WARMUP.newMin,
      max: MAILBOX_WARMUP.newMax,
    };
  }

  if (stage === "warming") {
    const warmingSpan = MAILBOX_WARMUP.trustedAfterDays - MAILBOX_WARMUP.newStageDays;
    const warmingDay = Math.max(0, dayIndex - MAILBOX_WARMUP.newStageDays);
    const t = warmingSpan <= 1 ? 1 : warmingDay / (warmingSpan - 1);
    return {
      stage,
      dayIndex,
      recommended: lerp(MAILBOX_WARMUP.newMax, MAILBOX_WARMUP.trustedDefault, t),
      min: MAILBOX_WARMUP.newMax,
      max: MAILBOX_WARMUP.trustedMax,
    };
  }

  return {
    stage,
    dayIndex,
    recommended: MAILBOX_WARMUP.trustedDefault,
    min: MAILBOX_WARMUP.trustedMin,
    max: MAILBOX_WARMUP.trustedMax,
  };
}

export function defaultDailyCapForStage(stage: InboxWarmupStage): number {
  if (stage === "new") return MAILBOX_WARMUP.newDefault;
  if (stage === "warming") return MAILBOX_WARMUP.warmingDefault;
  return MAILBOX_WARMUP.trustedDefault;
}

export function warmupCapWarning(dailyCap: number, rec: WarmupRecommendation): string | null {
  if (dailyCap <= rec.max) return null;
  if (rec.stage === "new") {
    return "New inboxes should stay at 20–40/day for the first 2–4 weeks.";
  }
  if (rec.stage === "warming") {
    return `This inbox is still warming. Recommended cap is ${rec.min}–${rec.max}/day. Raise volume gradually instead of jumping to ${dailyCap}.`;
  }
  return `Warmed inboxes are safest at ${rec.min}–${rec.max}/day per mailbox. ${dailyCap}/day is above that range.`;
}

export function assertVolumeWithinCap(params: {
  sendsLast24h: number;
  dailyCap: number;
  projectedAdditional?: number;
}): { ok: boolean; projectedTotal: number; overBy: number; remaining: number } {
  const projected = Math.max(0, params.projectedAdditional ?? 0);
  const projectedTotal = params.sendsLast24h + projected;
  const overBy = Math.max(0, projectedTotal - params.dailyCap);
  return {
    ok: projectedTotal <= params.dailyCap,
    projectedTotal,
    overBy,
    remaining: remainingDailyQuota(params.sendsLast24h, params.dailyCap),
  };
}

/** Day-over-day ceiling so volume does not jump from a trickle to hundreds. */
export function gradualVolumeCeiling(params: {
  sendsPrior24h: number;
  recommended: WarmupRecommendation;
}): number {
  const prior = Math.max(0, params.sendsPrior24h);
  const growthCeiling = Math.max(
    prior + MAILBOX_WARMUP.minDailyStep,
    Math.ceil(prior * (1 + MAILBOX_WARMUP.dayOverDayGrowth)),
  );
  if (prior === 0) return params.recommended.recommended;
  return Math.max(params.recommended.recommended, growthCeiling);
}

export function assertGradualRamp(params: {
  sendsPrior24h: number;
  projectedTotal: number;
  projectedAdditional: number;
  recommended: WarmupRecommendation;
}): { ok: boolean; allowedToday: number } {
  const allowedToday = Math.min(
    params.recommended.max,
    gradualVolumeCeiling({
      sendsPrior24h: params.sendsPrior24h,
      recommended: params.recommended,
    }),
  );
  const exceedsCeiling = params.projectedTotal > allowedToday;
  const burst = params.projectedAdditional >= MAILBOX_WARMUP.burstSize;
  return { ok: !exceedsCeiling || !burst, allowedToday };
}

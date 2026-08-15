import { db, outreachSchedule, leads } from "@/db";
import { and, eq, gte, isNotNull, sql } from "drizzle-orm";

export const DEFAULT_BOUNCE_RATE_THRESHOLD = 0.02;
export const DEFAULT_BOUNCE_RATE_MIN_SENT = 20;
export const DEFAULT_BOUNCE_RATE_WINDOW_HOURS = 168; // 7 days

export type BounceStats = {
  sent: number;
  bounced: number;
  rate: number;
  windowHours: number;
  threshold: number;
  minSent: number;
  exceedsThreshold: boolean;
};

export function bounceRateThreshold(): number {
  const raw = process.env.EMAIL_BOUNCE_RATE_THRESHOLD;
  if (!raw) return DEFAULT_BOUNCE_RATE_THRESHOLD;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_BOUNCE_RATE_THRESHOLD;
}

export function bounceRateMinSent(): number {
  const raw = process.env.EMAIL_BOUNCE_RATE_MIN_SENT;
  if (!raw) return DEFAULT_BOUNCE_RATE_MIN_SENT;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_BOUNCE_RATE_MIN_SENT;
}

/** Pure helper for unit tests. */
export function evaluateBounceRate(params: {
  sent: number;
  bounced: number;
  threshold?: number;
  minSent?: number;
}): { rate: number; exceedsThreshold: boolean } {
  const threshold = params.threshold ?? bounceRateThreshold();
  const minSent = params.minSent ?? bounceRateMinSent();
  const rate = params.sent > 0 ? params.bounced / params.sent : 0;
  const exceedsThreshold = params.sent >= minSent && rate >= threshold;
  return { rate, exceedsThreshold };
}

export async function getWorkspaceBounceStats(
  workspaceId: string,
  options?: { windowHours?: number },
): Promise<BounceStats> {
  const windowHours = options?.windowHours ?? DEFAULT_BOUNCE_RATE_WINDOW_HOURS;
  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);
  const threshold = bounceRateThreshold();
  const minSent = bounceRateMinSent();

  const [sentRow] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(outreachSchedule)
    .innerJoin(leads, eq(outreachSchedule.leadId, leads.id))
    .where(
      and(
        eq(leads.workspaceId, workspaceId),
        eq(outreachSchedule.status, "sent"),
        gte(outreachSchedule.sentAt, since),
      ),
    );

  const [bouncedRow] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(outreachSchedule)
    .innerJoin(leads, eq(outreachSchedule.leadId, leads.id))
    .where(
      and(
        eq(leads.workspaceId, workspaceId),
        eq(outreachSchedule.status, "sent"),
        gte(outreachSchedule.sentAt, since),
        isNotNull(outreachSchedule.bouncedAt),
      ),
    );

  const sent = sentRow?.total ?? 0;
  const bounced = bouncedRow?.total ?? 0;
  const { rate, exceedsThreshold } = evaluateBounceRate({ sent, bounced, threshold, minSent });

  return {
    sent,
    bounced,
    rate,
    windowHours,
    threshold,
    minSent,
    exceedsThreshold,
  };
}

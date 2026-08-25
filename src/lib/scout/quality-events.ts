import { and, eq, gte } from "drizzle-orm";
import { db, scoutQualityEvents } from "@/db";

export const SCOUT_QUALITY_EVENT = {
  companiesCompleted: "scout.companies.completed",
  peopleCompleted: "scout.people.completed",
  leadSkipped: "scout.lead_skipped",
  leadSaved: "scout.lead_saved",
} as const;

export type ScoutQualityEventType =
  (typeof SCOUT_QUALITY_EVENT)[keyof typeof SCOUT_QUALITY_EVENT];

export const EMPLOYER_SKIP_REASONS = [
  "does not work at this company",
  "title names a different employer",
  "employer verify failed",
];

export async function logScoutQualityEvent(params: {
  tenantId: string;
  workspaceId: string;
  userId?: string | null;
  sessionId?: string | null;
  eventType: ScoutQualityEventType | string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await db.insert(scoutQualityEvents).values({
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      userId: params.userId ?? null,
      sessionId: params.sessionId ?? null,
      eventType: params.eventType,
      metadata: params.metadata ?? {},
    });
  } catch {
    console.error("[scout-quality] failed to write event", params.eventType);
  }
}

export type ScoutQualitySummary = {
  days: number;
  companyRuns: number;
  emptyCompanyRuns: number;
  emptyCompanyRate: number;
  peopleRuns: number;
  emptyPeopleRuns: number;
  goldKept: number;
  goldShown: number;
  goldDensity: number;
  saved: number;
  skipped: number;
  employerSkipped: number;
  savePrecisionProxy: number;
  skipReasons: { reason: string; count: number }[];
  learningActive: boolean;
  learningSamples: number;
  learningUpdatedAt: string | null;
};

export async function aggregateScoutQuality(params: {
  tenantId: string;
  workspaceId: string;
  days: number;
}): Promise<Omit<ScoutQualitySummary, "learningActive" | "learningSamples" | "learningUpdatedAt">> {
  const since = new Date(Date.now() - params.days * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      eventType: scoutQualityEvents.eventType,
      metadata: scoutQualityEvents.metadata,
    })
    .from(scoutQualityEvents)
    .where(
      and(
        eq(scoutQualityEvents.tenantId, params.tenantId),
        eq(scoutQualityEvents.workspaceId, params.workspaceId),
        gte(scoutQualityEvents.createdAt, since),
      ),
    )
    .limit(5000);

  let companyRuns = 0;
  let emptyCompanyRuns = 0;
  let peopleRuns = 0;
  let emptyPeopleRuns = 0;
  let goldKept = 0;
  let goldShown = 0;
  let saved = 0;
  let skipped = 0;
  let employerSkipped = 0;
  const skipCounts = new Map<string, number>();

  for (const row of rows) {
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    if (row.eventType === SCOUT_QUALITY_EVENT.companiesCompleted) {
      companyRuns += 1;
      if (meta.empty === true || Number(meta.returned ?? 0) === 0) emptyCompanyRuns += 1;
    } else if (row.eventType === SCOUT_QUALITY_EVENT.peopleCompleted) {
      peopleRuns += 1;
      const returned = Number(meta.returned ?? 0);
      if (meta.empty === true || returned === 0) emptyPeopleRuns += 1;
      goldKept += Number(meta.goldKept ?? 0);
      goldShown += Number(meta.goldShown ?? returned);
    } else if (row.eventType === SCOUT_QUALITY_EVENT.leadSaved) {
      saved += 1;
    } else if (row.eventType === SCOUT_QUALITY_EVENT.leadSkipped) {
      skipped += 1;
      const reason = typeof meta.reason === "string" ? meta.reason : "unknown";
      skipCounts.set(reason, (skipCounts.get(reason) ?? 0) + 1);
      if (EMPLOYER_SKIP_REASONS.includes(reason)) employerSkipped += 1;
    }
  }

  const skipReasons = [...skipCounts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  const denom = saved + employerSkipped;
  return {
    days: params.days,
    companyRuns,
    emptyCompanyRuns,
    emptyCompanyRate: companyRuns ? Math.round((emptyCompanyRuns / companyRuns) * 100) : 0,
    peopleRuns,
    emptyPeopleRuns,
    goldKept,
    goldShown,
    goldDensity: goldShown ? Math.round((goldKept / goldShown) * 100) : 0,
    saved,
    skipped,
    employerSkipped,
    savePrecisionProxy: denom ? Math.round((saved / denom) * 100) : 0,
    skipReasons,
  };
}

export function matchScoreBand(score?: number): string | null {
  if (score == null || !Number.isFinite(score)) return null;
  if (score >= 70) return "high";
  if (score >= 35) return "medium";
  return "low";
}

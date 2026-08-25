import type { PlatformIntent } from "@/lib/brand/platform-intent";
import type { ScoutQualityLearning, ScoutQualityWeights } from "@/lib/enrichment/quality-profile";
import { and, eq, gte, inArray } from "drizzle-orm";
import { db, accounts, leads, yieldFunnel, workspaceSettings } from "@/db";
import { loadUserPreferenceProfile, type UserPreferenceProfile } from "@/lib/settings/preference-profile";

export type OutcomeSample = {
  replied: boolean;
  hasWebsite: boolean;
  local: boolean;
  reachable: boolean;
};

const MAX_DELTA = 0.1;
const MIN_OUTREACHED = 30;

export function clampWeightDelta(n: number): number {
  return Math.max(-MAX_DELTA, Math.min(MAX_DELTA, n));
}

function replyRate(samples: OutcomeSample[], pred: (s: OutcomeSample) => boolean): number | null {
  const slice = samples.filter(pred);
  if (slice.length < 8) return null;
  return slice.filter((s) => s.replied).length / slice.length;
}

/** Pure: map funnel buckets to ±10% weight nudges. */
export function computeScoutWeightDeltas(samples: OutcomeSample[]): Partial<ScoutQualityWeights> | null {
  if (samples.length < MIN_OUTREACHED) return null;
  const deltas: Partial<ScoutQualityWeights> = {};

  const siteYes = replyRate(samples, (s) => s.hasWebsite);
  const siteNo = replyRate(samples, (s) => !s.hasWebsite);
  if (siteYes != null && siteNo != null && siteYes !== siteNo) {
    deltas.officialWebsite = clampWeightDelta(siteYes > siteNo ? 0.08 : -0.08);
  }

  const localYes = replyRate(samples, (s) => s.local);
  const localNo = replyRate(samples, (s) => !s.local);
  if (localYes != null && localNo != null && localYes !== localNo) {
    deltas.locality = clampWeightDelta(localYes > localNo ? 0.08 : -0.08);
  }

  const reachYes = replyRate(samples, (s) => s.reachable);
  const reachNo = replyRate(samples, (s) => !s.reachable);
  if (reachYes != null && reachNo != null && reachYes !== reachNo) {
    deltas.reachability = clampWeightDelta(reachYes > reachNo ? 0.08 : -0.08);
  }

  return Object.keys(deltas).length ? deltas : { reachability: 0 };
}

export function applyWeightDeltas(
  weights: ScoutQualityWeights,
  deltas?: Partial<ScoutQualityWeights> | null,
): ScoutQualityWeights {
  if (!deltas) return weights;
  const next = { ...weights };
  (Object.keys(weights) as (keyof ScoutQualityWeights)[]).forEach((key) => {
    const d = deltas[key];
    if (typeof d === "number" && Number.isFinite(d)) {
      next[key] = Math.max(0.02, weights[key] * (1 + clampWeightDelta(d)));
    }
  });
  const sum = Object.values(next).reduce((a, b) => a + b, 0);
  if (sum <= 0) return weights;
  (Object.keys(next) as (keyof ScoutQualityWeights)[]).forEach((key) => {
    next[key] = next[key] / sum;
  });
  return next;
}

export function parseScoutQualityLearning(raw: unknown): ScoutQualityLearning | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  if (typeof o.updatedAt !== "string" || typeof o.sampleCount !== "number") return undefined;
  return {
    updatedAt: o.updatedAt,
    sampleCount: o.sampleCount,
    outreachedCount: typeof o.outreachedCount === "number" ? o.outreachedCount : 0,
    repliedCount: typeof o.repliedCount === "number" ? o.repliedCount : 0,
    deltasByIntent:
      o.deltasByIntent && typeof o.deltasByIntent === "object"
        ? (o.deltasByIntent as ScoutQualityLearning["deltasByIntent"])
        : {},
  };
}

export async function loadScoutQualityLearning(workspaceId: string): Promise<ScoutQualityLearning | undefined> {
  const profile = await loadUserPreferenceProfile(workspaceId);
  return profile.scoutQualityLearning;
}

export async function saveScoutQualityLearning(
  workspaceId: string,
  learning: ScoutQualityLearning,
): Promise<void> {
  const profile = await loadUserPreferenceProfile(workspaceId);
  const next: UserPreferenceProfile = {
    ...profile,
    scoutQualityLearning: learning,
    updatedAt: new Date().toISOString(),
  };
  await db
    .insert(workspaceSettings)
    .values({
      workspaceId,
      userPreferenceProfile: next,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: workspaceSettings.workspaceId,
      set: {
        userPreferenceProfile: next,
        updatedAt: new Date(),
      },
    });
}

export async function refreshScoutQualityLearning(params: {
  tenantId: string;
  workspaceId: string;
  intent?: PlatformIntent;
}): Promise<ScoutQualityLearning | null> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const outreached = await db
    .select({
      leadId: yieldFunnel.leadId,
      accountId: leads.accountId,
    })
    .from(yieldFunnel)
    .innerJoin(leads, eq(leads.id, yieldFunnel.leadId))
    .where(
      and(
        eq(leads.tenantId, params.tenantId),
        eq(leads.workspaceId, params.workspaceId),
        eq(yieldFunnel.stage, "outreached"),
        gte(yieldFunnel.enteredAt, since),
      ),
    )
    .limit(2000);

  if (outreached.length < MIN_OUTREACHED) return null;

  const leadIds = [...new Set(outreached.map((r) => r.leadId))];
  const repliedRows = await db
    .select({ leadId: yieldFunnel.leadId })
    .from(yieldFunnel)
    .where(and(inArray(yieldFunnel.leadId, leadIds), eq(yieldFunnel.stage, "replied")));
  const replied = new Set(repliedRows.map((r) => r.leadId));

  const accountIds = [...new Set(outreached.map((r) => r.accountId).filter(Boolean))] as string[];
  const accountRows = accountIds.length
    ? await db
        .select({
          id: accounts.id,
          domain: accounts.domain,
          website: accounts.website,
          city: accounts.city,
          fitScore: accounts.fitScore,
        })
        .from(accounts)
        .where(inArray(accounts.id, accountIds))
    : [];
  const accountById = new Map(accountRows.map((a) => [a.id, a]));

  const samples: OutcomeSample[] = outreached.map((row) => {
    const account = row.accountId ? accountById.get(row.accountId) : undefined;
    return {
      replied: replied.has(row.leadId),
      hasWebsite: Boolean(account?.domain?.trim() || account?.website?.trim()),
      local: Boolean(account?.city?.trim()),
      reachable: (account?.fitScore ?? 0) >= 55,
    };
  });

  const deltas = computeScoutWeightDeltas(samples);
  if (!deltas) return null;

  const intent = params.intent ?? "corporate_gifting";
  const existing = (await loadScoutQualityLearning(params.workspaceId)) ?? {
    updatedAt: new Date().toISOString(),
    sampleCount: 0,
    outreachedCount: 0,
    repliedCount: 0,
    deltasByIntent: {},
  };
  const learning: ScoutQualityLearning = {
    updatedAt: new Date().toISOString(),
    sampleCount: samples.length,
    outreachedCount: samples.length,
    repliedCount: samples.filter((s) => s.replied).length,
    deltasByIntent: {
      ...existing.deltasByIntent,
      [intent]: deltas,
    },
  };
  await saveScoutQualityLearning(params.workspaceId, learning);
  return learning;
}

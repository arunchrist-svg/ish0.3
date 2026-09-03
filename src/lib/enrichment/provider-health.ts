/**
 * Degradation state for discovery providers.
 *
 * Google Places exhausting its daily `SearchTextRequest` quota once took the pipeline down for
 * a day while the only symptom was an empty result list: the error was caught per-step and
 * pushed into `errors[]`, which the UI never showed. This module records that a provider is
 * degraded so it can be surfaced BEFORE a scout runs, and can explain failures afterwards.
 *
 * Discovery API keys are process-global env vars, so health is process-global too — an
 * in-memory cache is the right fidelity. When keys become per-tenant this needs to move to a
 * table keyed by tenant.
 */
import type { SearchProvider } from "./config";

export type HealthState =
  | "ok"
  | "quota_exhausted"
  | "auth_failed"
  | "rate_limited"
  | "missing_key";

export type ProviderHealth = {
  provider: SearchProvider;
  state: Exclude<HealthState, "ok">;
  message: string;
  since: number;
  expiresAt: number;
};

const FIVE_MINUTES = 5 * 60 * 1000;
const FIFTEEN_MINUTES = 15 * 60 * 1000;

const degraded = new Map<SearchProvider, ProviderHealth>();

/** Classify a provider error into a health state. Single source of truth for these patterns. */
export function classifyProviderError(err: unknown): HealthState {
  const msg = err instanceof Error ? err.message : String(err);
  if (/API_KEY (is )?(missing|not set)|not set/i.test(msg)) return "missing_key";
  if (/quota exceeded|usage limit|quota metric|out of credits/i.test(msg)) return "quota_exhausted";
  if (/401|403|invalid api key|unauthorized|authentication failed/i.test(msg)) return "auth_failed";
  if (/429|rate.?limit|too many requests/i.test(msg)) return "rate_limited";
  if (/quota/i.test(msg)) return "quota_exhausted";
  return "ok";
}

/**
 * Google Places quota is a per-day allowance that resets at midnight Pacific, but users read
 * these banners in IST. Expiring at the next IST midnight is the honest approximation: it never
 * claims recovery earlier than it happens for an India-only product.
 */
function nextIstMidnight(now: number): number {
  const IST_OFFSET = 5.5 * 60 * 60 * 1000;
  const istNow = now + IST_OFFSET;
  const dayStart = Math.floor(istNow / 86_400_000) * 86_400_000;
  return dayStart + 86_400_000 - IST_OFFSET;
}

function ttlFor(state: Exclude<HealthState, "ok">, now: number): number {
  if (state === "quota_exhausted") return nextIstMidnight(now);
  if (state === "auth_failed") return now + FIFTEEN_MINUTES;
  if (state === "rate_limited") return now + FIVE_MINUTES;
  return now + FIVE_MINUTES;
}

export function markProviderDegraded(
  provider: SearchProvider,
  state: HealthState,
  message: string,
  now = Date.now(),
): void {
  // `missing_key` is derived live from discovery-prerequisites, never cached — a key can be
  // added to the environment without this process seeing an error first.
  if (state === "ok" || state === "missing_key") return;
  degraded.set(provider, {
    provider,
    state,
    message,
    since: degraded.get(provider)?.since ?? now,
    expiresAt: ttlFor(state, now),
  });
}

/** Record a provider error, classifying it. No-op for errors that are not degradation. */
export function noteProviderError(provider: SearchProvider, err: unknown, message?: string): void {
  const state = classifyProviderError(err);
  if (state === "ok" || state === "missing_key") return;
  markProviderDegraded(provider, state, message ?? (err instanceof Error ? err.message : String(err)));
}

export function markProviderHealthy(provider: SearchProvider): void {
  degraded.delete(provider);
}

export function getProviderHealth(
  provider: SearchProvider,
  now = Date.now(),
): ProviderHealth | null {
  const entry = degraded.get(provider);
  if (!entry) return null;
  if (entry.expiresAt <= now) {
    degraded.delete(provider);
    return null;
  }
  return entry;
}

export function listDegradedProviders(now = Date.now()): ProviderHealth[] {
  const out: ProviderHealth[] = [];
  for (const provider of [...degraded.keys()]) {
    const entry = getProviderHealth(provider, now);
    if (entry) out.push(entry);
  }
  return out;
}

/** Test seam — health is module state, so suites must be able to reset it. */
export function resetProviderHealth(): void {
  degraded.clear();
}

const STATE_COPY: Record<Exclude<HealthState, "ok">, string> = {
  quota_exhausted: "daily quota exhausted",
  auth_failed: "API key rejected",
  rate_limited: "rate limited",
  missing_key: "API key missing",
};

export function describeProviderHealth(health: ProviderHealth, labels: Record<string, string>): string {
  const label = labels[health.provider] ?? health.provider;
  return `${label}: ${STATE_COPY[health.state]}.`;
}

/**
 * Map a waterfall step label to the provider it exercised.
 * Steps are named after the provider plus a role suffix ("google_places_fallback",
 * "india_directories_more", "name_search_tavily"), so a prefix/substring match is sufficient
 * and avoids a second registry that could drift from the call sites.
 */
export function providerFromStepLabel(label: string): SearchProvider | null {
  if (label.startsWith("google_places")) return "google_places";
  if (label.startsWith("india_directories")) return "india_directories";
  if (label.startsWith("apollo")) return "apollo";
  if (label.startsWith("tavily_ai") || label.includes("tavily")) return "tavily_ai";
  return null;
}

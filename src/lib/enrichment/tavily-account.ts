import { getTavilyKeys } from "./tavily-keys";

export type TavilyAccountKeyUsage = {
  keyId: string;
  label: string;
  used: number;
  limit: number;
  remaining: number;
  exhausted: boolean;
  plan: string | null;
  fetchError?: string;
};

type UsageCache = {
  fetchedAt: number;
  keys: TavilyAccountKeyUsage[];
};

let cache: UsageCache | null = null;
const CACHE_MS = 45_000;

function parseUsagePayload(keyId: string, label: string, data: Record<string, unknown>): TavilyAccountKeyUsage {
  const account = (data.account ?? {}) as Record<string, unknown>;
  const key = (data.key ?? {}) as Record<string, unknown>;

  const used =
    typeof account.plan_usage === "number"
      ? account.plan_usage
      : typeof key.usage === "number"
        ? key.usage
        : 0;

  const rawLimit =
    typeof account.plan_limit === "number"
      ? account.plan_limit
      : typeof key.limit === "number"
        ? key.limit
        : null;

  const limit = rawLimit ?? 1000;
  const remaining = Math.max(0, limit - used);

  return {
    keyId,
    label,
    used,
    limit,
    remaining,
    exhausted: used >= limit,
    plan: typeof account.current_plan === "string" ? account.current_plan : null,
  };
}

/** Live credits from Tavily GET /usage — matches the dashboard, not local session flags. */
export async function fetchTavilyAccountUsage(options?: { force?: boolean }): Promise<TavilyAccountKeyUsage[]> {
  const now = Date.now();
  if (!options?.force && cache && now - cache.fetchedAt < CACHE_MS) {
    return cache.keys;
  }

  const keys = getTavilyKeys();
  if (!keys.length) {
    cache = { fetchedAt: now, keys: [] };
    return [];
  }

  const results = await Promise.all(
    keys.map(async (entry) => {
      try {
        const res = await fetch("https://api.tavily.com/usage", {
          headers: { Authorization: `Bearer ${entry.key}` },
          cache: "no-store",
        });
        const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;

        if (!res.ok) {
          const detail =
            data.detail && typeof data.detail === "object" && "error" in (data.detail as object)
              ? String((data.detail as { error?: unknown }).error)
              : `HTTP ${res.status}`;
          return {
            keyId: entry.id,
            label: entry.label,
            used: 0,
            limit: 1000,
            remaining: 1000,
            exhausted: false,
            plan: null,
            fetchError: detail,
          } satisfies TavilyAccountKeyUsage;
        }

        return parseUsagePayload(entry.id, entry.label, data);
      } catch (e) {
        return {
          keyId: entry.id,
          label: entry.label,
          used: 0,
          limit: 1000,
          remaining: 1000,
          exhausted: false,
          plan: null,
          fetchError: e instanceof Error ? e.message : "Could not fetch Tavily usage",
        } satisfies TavilyAccountKeyUsage;
      }
    }),
  );

  cache = { fetchedAt: now, keys: results };
  return results;
}

export function invalidateTavilyAccountUsageCache(): void {
  cache = null;
}

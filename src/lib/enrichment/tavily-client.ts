import { fetchTavilyAccountUsage } from "./tavily-account";
import { getTavilyKeys } from "./tavily-keys";
import { getNextTavilyKey, recordTavilySearch, rotateToNextKey } from "./tavily-usage";

export type TavilyHit = { title: string; url: string; content: string };

export const TAVILY_QUOTA_COMPANY_MSG =
  "Tavily API quota exceeded — upgrade at tavily.com or wait for your monthly credit reset.";

export const TAVILY_QUOTA_PEOPLE_MSG =
  "People search needs Tavily credits (or Apollo). Company scouting can continue via Google Places.";

export function isTavilyQuotaStatus(status: number): boolean {
  return status === 429 || status === 432;
}

export function isTavilyQuotaError(msg: string): boolean {
  return /quota|usage limit|rate.?limit|429|432|exhausted|exceeds your plan|plan.?s set usage/i.test(msg);
}

export class TavilyQuotaError extends Error {
  constructor(message = TAVILY_QUOTA_COMPANY_MSG) {
    super(message);
    this.name = "TavilyQuotaError";
  }
}

function extractTavilyErrorText(status: number, data: unknown): string {
  const detail =
    data && typeof data === "object" && "detail" in data
      ? (data as { detail?: unknown }).detail
      : data;

  if (typeof detail === "string") return detail;
  if (detail && typeof detail === "object" && "error" in detail) {
    return String((detail as { error?: unknown }).error);
  }
  if (typeof data === "object" && data && "error" in data) {
    return String((data as { error?: unknown }).error);
  }
  return `Tavily failed: ${status}`;
}

function tavilyErrorMessage(status: number, data: unknown): string {
  const msg = extractTavilyErrorText(status, data);
  if (isTavilyQuotaStatus(status) || isTavilyQuotaError(msg)) {
    return TAVILY_QUOTA_COMPANY_MSG;
  }
  return msg;
}

export function optimizedMaxResults(limit: number): number {
  return Math.min(Math.max(1, limit), 8);
}

const SEARCH_BODY_OPTS = {
  search_depth: "basic" as const,
  include_answer: false,
  include_raw_content: false,
};

export async function tavilySearch(query: string, limit = 8): Promise<TavilyHit[]> {
  if (!getTavilyKeys().length) throw new Error("TAVILY_API_KEY not set");

  let accountKeys = await fetchTavilyAccountUsage();
  const maxResults = optimizedMaxResults(limit);
  let keyEntry = getNextTavilyKey(accountKeys);
  let lastError: Error | null = null;
  const tried = new Set<string>();

  while (keyEntry && !tried.has(keyEntry.id)) {
    tried.add(keyEntry.id);

    try {
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: keyEntry.key,
          query,
          ...SEARCH_BODY_OPTS,
          max_results: maxResults,
        }),
      });

      const data = await res.json().catch(() => ({}));
      const quotaResponse =
        isTavilyQuotaStatus(res.status) ||
        (data.detail && !data.results && isTavilyQuotaError(extractTavilyErrorText(res.status, data)));

      if (!res.ok || (data.detail && !data.results)) {
        const msg = tavilyErrorMessage(res.status, data);
        if (quotaResponse || isTavilyQuotaError(msg)) {
          lastError = new Error(msg);
          keyEntry = rotateToNextKey(keyEntry.id, accountKeys);
          continue;
        }
        throw new Error(msg);
      }

      recordTavilySearch(keyEntry.id);
      return data.results ?? [];
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      if (isTavilyQuotaError(err.message) && keyEntry) {
        lastError = err;
        keyEntry = rotateToNextKey(keyEntry.id, accountKeys);
        continue;
      }
      throw err;
    }
  }

  throw lastError ?? new TavilyQuotaError();
}

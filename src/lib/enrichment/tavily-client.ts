import { fetchTavilyAccountUsage, getCachedTavilyAccountUsage } from "./tavily-account";
import { getTavilyKeys } from "./tavily-keys";
import {
  getNextTavilyKey,
  recordTavilySearch,
  rotateToNextKey,
  skipRateLimitedKey,
  bootstrapActiveTavilyKey,
  syncSessionKeysFromAccount,
} from "./tavily-usage";

export type TavilyHit = { title: string; url: string; content: string };

export const TAVILY_QUOTA_COMPANY_MSG =
  "Tavily API quota exceeded. Upgrade at tavily.com or wait for your monthly credit reset.";

export const TAVILY_QUOTA_INDIA_DIRECTORIES_MSG =
  "India Directories uses Tavily credits to search Indian directory sites. Switch Company search to Google Places, add another Tavily key, or wait for your monthly reset.";

export const TAVILY_QUOTA_PEOPLE_MSG =
  "People search needs Tavily credits (or Apollo). Company scouting can continue via Google Places.";

export const TAVILY_RATE_LIMIT_MSG =
  "Tavily is rate-limiting right now. Credits are still available. Wait a few seconds and fetch again.";

const RATE_LIMIT_RETRIES = 2;
const RATE_LIMIT_RETRY_MS = 250;
const TAVILY_TIMEOUT_MS = 20_000;
const ABORT_RETRIES = 1;

function isAbortError(error: unknown): boolean {
  if (!error) return false;
  if (error instanceof Error && (error.name === "AbortError" || /aborted/i.test(error.message))) {
    return true;
  }
  return /aborted/i.test(String(error));
}

export function isTavilyPlanQuotaStatus(status: number): boolean {
  return status === 432;
}

export function isTavilyRateLimitStatus(status: number): boolean {
  return status === 429;
}

/** Plan-credit exhaustion only. Do not treat HTTP 429 rate limits as out of credits. */
export function isTavilyQuotaStatus(status: number): boolean {
  return isTavilyPlanQuotaStatus(status);
}

export function isTavilyRateLimitError(msg: string): boolean {
  return /rate.?limit|too many requests|excessive requests|credits are still available/i.test(msg);
}

export function isTavilyQuotaError(msg: string): boolean {
  if (isTavilyRateLimitError(msg)) return false;
  return /quota|usage limit|432|exhausted|exceeds your plan|plan.?s set usage/i.test(msg);
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

function isTavilyAuthStatus(status: number): boolean {
  return status === 401 || status === 403;
}

function isTavilyAuthError(msg: string): boolean {
  return /unauthorized|forbidden|invalid.?api.?key|authentication|api.?key.?rejected/i.test(msg);
}

function classifyTavilyFailure(
  status: number,
  rawMsg: string,
): "quota" | "rate_limit" | "auth" | "other" {
  if (isTavilyAuthStatus(status) || isTavilyAuthError(rawMsg)) return "auth";
  if (isTavilyPlanQuotaStatus(status)) return "quota";
  if (isTavilyRateLimitStatus(status)) return "rate_limit";
  if (isTavilyRateLimitError(rawMsg)) return "rate_limit";
  if (isTavilyQuotaError(rawMsg)) return "quota";
  return "other";
}

function tavilyErrorMessage(
  status: number,
  data: unknown,
): { kind: "quota" | "rate_limit" | "auth" | "other"; msg: string } {
  const raw = extractTavilyErrorText(status, data);
  const kind = classifyTavilyFailure(status, raw);
  if (kind === "quota") return { kind, msg: TAVILY_QUOTA_COMPANY_MSG };
  if (kind === "rate_limit") return { kind, msg: TAVILY_RATE_LIMIT_MSG };
  if (kind === "auth") {
    return { kind, msg: "Tavily API key was rejected. Check the key in .env.local and restart." };
  }
  return { kind, msg: raw };
}

export function optimizedMaxResults(limit: number): number {
  return Math.min(Math.max(1, limit), 8);
}

const SEARCH_BODY_OPTS = {
  search_depth: "basic" as const,
  include_answer: false,
  include_raw_content: false,
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadAccountKeys(force = false) {
  const cached = getCachedTavilyAccountUsage();
  if (!force && cached?.length) return cached;
  return fetchTavilyAccountUsage({ force }).catch(() => cached ?? []);
}

export async function tavilySearch(query: string, limit = 8): Promise<TavilyHit[]> {
  if (!getTavilyKeys().length) throw new Error("TAVILY_API_KEY not set");

  let accountKeys = await loadAccountKeys();
  if (accountKeys.length) {
    syncSessionKeysFromAccount(accountKeys);
    bootstrapActiveTavilyKey(accountKeys);
  }

  const maxResults = optimizedMaxResults(limit);
  let keyEntry = getNextTavilyKey(accountKeys);
  let lastError: Error | null = null;
  const triedQuota = new Set<string>();
  const skippedRateLimit = new Set<string>();
  let rateRetries = 0;

  while (keyEntry) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TAVILY_TIMEOUT_MS);
      let res: Response;
      try {
        res = await fetch("https://api.tavily.com/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            api_key: keyEntry.key,
            query,
            ...SEARCH_BODY_OPTS,
            max_results: maxResults,
          }),
        });
      } finally {
        clearTimeout(timer);
      }

      const data = await res.json().catch(() => ({}));
      if (!res.ok || (data.detail && !data.results)) {
        const classified = tavilyErrorMessage(res.status, data);
        lastError = new Error(classified.msg);

        if (classified.kind === "quota" || classified.kind === "auth") {
          triedQuota.add(keyEntry.id);
          rateRetries = 0;
          if (!accountKeys.length) {
            accountKeys = await loadAccountKeys(true);
          }
          keyEntry = rotateToNextKey(
            keyEntry.id,
            accountKeys.length ? accountKeys : undefined,
            new Set([...triedQuota, ...skippedRateLimit]),
          );
          continue;
        }

        if (classified.kind === "rate_limit") {
          if (rateRetries < RATE_LIMIT_RETRIES) {
            rateRetries += 1;
            await sleep(RATE_LIMIT_RETRY_MS * rateRetries);
            continue;
          }
          skippedRateLimit.add(keyEntry.id);
          rateRetries = 0;
          keyEntry = skipRateLimitedKey(
            keyEntry.id,
            accountKeys.length ? accountKeys : undefined,
            new Set([...triedQuota, ...skippedRateLimit]),
          );
          continue;
        }

        throw lastError;
      }

      recordTavilySearch(keyEntry.id);
      return data.results ?? [];
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      if (!keyEntry) throw err;
      if (isAbortError(err) && rateRetries < ABORT_RETRIES) {
        rateRetries += 1;
        await sleep(400 * rateRetries);
        continue;
      }
      const kind = classifyTavilyFailure(0, err.message);
      if (kind === "quota" || kind === "auth") {
        lastError = err;
        triedQuota.add(keyEntry.id);
        rateRetries = 0;
        if (!accountKeys.length) {
          accountKeys = await loadAccountKeys(true);
        }
        keyEntry = rotateToNextKey(
          keyEntry.id,
          accountKeys.length ? accountKeys : undefined,
          new Set([...triedQuota, ...skippedRateLimit]),
        );
        continue;
      }
      if (kind === "rate_limit") {
        lastError = err;
        if (rateRetries < RATE_LIMIT_RETRIES) {
          rateRetries += 1;
          await sleep(RATE_LIMIT_RETRY_MS * rateRetries);
          continue;
        }
        skippedRateLimit.add(keyEntry.id);
        rateRetries = 0;
        keyEntry = skipRateLimitedKey(
          keyEntry.id,
          accountKeys.length ? accountKeys : undefined,
          new Set([...triedQuota, ...skippedRateLimit]),
        );
        continue;
      }
      throw err;
    }
  }

  throw lastError ?? new TavilyQuotaError();
}

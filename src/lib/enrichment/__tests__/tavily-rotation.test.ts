import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invalidateTavilyAccountUsageCache } from "@/lib/enrichment/tavily-account";
import { tavilySearch } from "@/lib/enrichment/tavily-client";
import { getTavilyKeys } from "@/lib/enrichment/tavily-keys";
import {
  getNextTavilyKey,
  getTavilyUsageSnapshot,
  resetTavilyKeySession,
  takeTavilyKeySwitchMessage,
} from "@/lib/enrichment/tavily-usage";

const KEY_1 = "tvly-test-primary-aaaa";
const KEY_2 = "tvly-test-backup-bbbb";

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function searchApiKey(init?: RequestInit): string {
  const body = typeof init?.body === "string" ? init.body : "";
  try {
    return String(JSON.parse(body).api_key ?? "");
  } catch {
    return "";
  }
}

function usageBearer(init?: RequestInit): string {
  const headers = init?.headers;
  if (!headers || headers instanceof Headers) {
    return headers instanceof Headers ? (headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "") : "";
  }
  const record = headers as Record<string, string>;
  const auth = record.Authorization ?? record.authorization ?? "";
  return auth.replace(/^Bearer\s+/i, "");
}

function usagePayload(used: number) {
  return {
    account: { plan_usage: used, plan_limit: 1000, current_plan: "dev" },
    key: { usage: used, limit: 1000 },
  };
}

describe("Tavily 2-key rotation", () => {
  beforeEach(() => {
    resetTavilyKeySession();
    invalidateTavilyAccountUsageCache();
    vi.unstubAllEnvs();
    vi.stubEnv("TAVILY_API_KEY", KEY_1);
    vi.stubEnv("TAVILY_API_KEY_2", KEY_2);
    vi.stubEnv("TAVILY_API_KEY_3", "");
    vi.stubEnv("TAVILY_API_KEYS", "");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    resetTavilyKeySession();
    invalidateTavilyAccountUsageCache();
  });

  it("loads TAVILY_API_KEY and TAVILY_API_KEY_2", () => {
    expect(getTavilyKeys().map((k) => k.id)).toEqual(["key-1", "key-2"]);
  });

  it("rotates to the backup key on 432 even when /usage still reports remaining on key-1", async () => {
    const searchKeys: string[] = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes("/usage")) {
        return jsonResponse(200, usagePayload(usageBearer(init) === KEY_1 ? 10 : 5));
      }
      const apiKey = searchApiKey(init);
      searchKeys.push(apiKey);
      if (apiKey === KEY_1) {
        return jsonResponse(432, {
          detail: { error: "This request exceeds your plan's set usage limit" },
        });
      }
      return jsonResponse(200, {
        results: [{ title: "Acme", url: "https://acme.test", content: "Acme HQ" }],
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const hits = await tavilySearch("Acme company India", 5);
    expect(hits).toHaveLength(1);
    expect(searchKeys).toEqual([KEY_1, KEY_2]);
    expect(takeTavilyKeySwitchMessage()).toMatch(/Switched to backup key/);
  });

  it("keeps people search on the backup key after company search rotates (session reject)", async () => {
    let searchCalls = 0;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes("/usage")) {
        return jsonResponse(200, usagePayload(usageBearer(init) === KEY_1 ? 10 : 5));
      }
      const apiKey = searchApiKey(init);
      searchCalls += 1;
      if (searchCalls === 1) {
        expect(apiKey).toBe(KEY_1);
        return jsonResponse(432, { detail: { error: "usage limit exceeded" } });
      }
      expect(apiKey).toBe(KEY_2);
      return jsonResponse(200, {
        results: [{ title: "Lead", url: "https://linkedin.com/in/x", content: "Director at Acme" }],
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await tavilySearch("Acme company directory", 5);
    await getTavilyUsageSnapshot();
    expect(getNextTavilyKey()?.id).toBe("key-2");

    const peopleHits = await tavilySearch("Acme LinkedIn Director", 5);
    expect(peopleHits).toHaveLength(1);
    expect(searchCalls).toBe(3);
    expect(getNextTavilyKey()?.id).toBe("key-2");
  });
});

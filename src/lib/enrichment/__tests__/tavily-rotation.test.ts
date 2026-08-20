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
const KEY_3 = "tvly-test-third-cccc";
const KEY_4 = "tvly-test-fourth-dddd";

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
    vi.stubEnv("TAVILY_API_KEY_4", "");
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
    expect(takeTavilyKeySwitchMessage()).toMatch(/Switched to next key/);
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

describe("Tavily 3-key rotation", () => {
  beforeEach(() => {
    resetTavilyKeySession();
    invalidateTavilyAccountUsageCache();
    vi.unstubAllEnvs();
    vi.stubEnv("TAVILY_API_KEY", KEY_1);
    vi.stubEnv("TAVILY_API_KEY_2", KEY_2);
    vi.stubEnv("TAVILY_API_KEY_3", KEY_3);
    vi.stubEnv("TAVILY_API_KEY_4", "");
    vi.stubEnv("TAVILY_API_KEYS", "");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    resetTavilyKeySession();
    invalidateTavilyAccountUsageCache();
  });

  it("loads all three numbered Tavily keys", () => {
    expect(getTavilyKeys().map((k) => k.id)).toEqual(["key-1", "key-2", "key-3"]);
  });

  it("stays on the same key for successful searches (sequential exhaustion strategy)", async () => {
    const searchKeys: string[] = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes("/usage")) {
        return jsonResponse(200, usagePayload(5));
      }
      const apiKey = searchApiKey(init);
      searchKeys.push(apiKey);
      return jsonResponse(200, {
        results: [{ title: "Acme", url: "https://acme.test", content: "Acme HQ" }],
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await tavilySearch("search one", 5);
    await tavilySearch("search two", 5);
    await tavilySearch("search three", 5);
    await tavilySearch("search four", 5);

    // All four searches use key-1; key-2 and key-3 are held in reserve until key-1 hits quota.
    expect(searchKeys).toEqual([KEY_1, KEY_1, KEY_1, KEY_1]);
  });

  it("fails over through key-2 to key-3 when earlier keys hit quota", async () => {
    const searchKeys: string[] = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes("/usage")) {
        return jsonResponse(200, usagePayload(5));
      }
      const apiKey = searchApiKey(init);
      searchKeys.push(apiKey);
      if (apiKey === KEY_1 || apiKey === KEY_2) {
        return jsonResponse(432, { detail: { error: "usage limit exceeded" } });
      }
      return jsonResponse(200, {
        results: [{ title: "Lead", url: "https://linkedin.com/in/x", content: "Director at Acme" }],
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const hits = await tavilySearch("Acme LinkedIn Director", 5);
    expect(hits).toHaveLength(1);
    expect(searchKeys).toEqual([KEY_1, KEY_2, KEY_3]);
    expect(getNextTavilyKey()?.id).toBe("key-3");
  });

  it("skips an exhausted key-1 and uses the key that still has credits", async () => {
    const searchKeys: string[] = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes("/usage")) {
        const used = usageBearer(init) === KEY_1 ? 1001 : 811;
        return jsonResponse(200, usagePayload(used));
      }
      const apiKey = searchApiKey(init);
      searchKeys.push(apiKey);
      return jsonResponse(200, {
        results: [{ title: "Acme", url: "https://acme.test", content: "Acme HQ" }],
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const hits = await tavilySearch("Acme company India", 5);
    expect(hits).toHaveLength(1);
    expect(searchKeys).toEqual([KEY_2]);
    expect(getNextTavilyKey()?.id).toBe("key-2");
  });

  it("retries a 429 on a key with remaining credits instead of marking it exhausted", async () => {
    const searchKeys: string[] = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes("/usage")) {
        return jsonResponse(200, usagePayload(usageBearer(init) === KEY_1 ? 811 : 5));
      }
      const apiKey = searchApiKey(init);
      searchKeys.push(apiKey);
      if (apiKey === KEY_1 && searchKeys.filter((k) => k === KEY_1).length < 3) {
        return jsonResponse(429, { detail: { error: "Too many requests" } });
      }
      if (apiKey === KEY_1) {
        return jsonResponse(200, {
          results: [{ title: "Acme", url: "https://acme.test", content: "Acme HQ" }],
        });
      }
      return jsonResponse(200, {
        results: [{ title: "Backup", url: "https://backup.test", content: "Backup HQ" }],
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const hits = await tavilySearch("Acme company India", 5);
    expect(hits).toHaveLength(1);
    expect(searchKeys[0]).toBe(KEY_1);
    expect(searchKeys).toContain(KEY_1);
    expect(searchKeys.at(-1)).toBe(KEY_1);
    expect(getNextTavilyKey()?.id).toBe("key-1");
  });

  it("fails over to the next key on 429 without treating the first key as out of credits", async () => {
    const searchKeys: string[] = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes("/usage")) {
        return jsonResponse(200, usagePayload(usageBearer(init) === KEY_1 ? 811 : 25));
      }
      const apiKey = searchApiKey(init);
      searchKeys.push(apiKey);
      if (apiKey === KEY_1) {
        return jsonResponse(429, { detail: { error: "Too many requests" } });
      }
      return jsonResponse(200, {
        results: [{ title: "Lead", url: "https://linkedin.com/in/x", content: "Director at Acme" }],
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const hits = await tavilySearch("Acme LinkedIn Director", 5);
    expect(hits).toHaveLength(1);
    expect(searchKeys.at(-1)).toBe(KEY_2);
    expect(searchKeys.filter((k) => k === KEY_1).length).toBe(3);
    expect(getNextTavilyKey()?.id).toBe("key-2");
  });
});

describe("Tavily 4-key rotation", () => {
  beforeEach(() => {
    resetTavilyKeySession();
    invalidateTavilyAccountUsageCache();
    vi.unstubAllEnvs();
    vi.stubEnv("TAVILY_API_KEY", KEY_1);
    vi.stubEnv("TAVILY_API_KEY_2", KEY_2);
    vi.stubEnv("TAVILY_API_KEY_3", KEY_3);
    vi.stubEnv("TAVILY_API_KEY_4", KEY_4);
    vi.stubEnv("TAVILY_API_KEYS", "");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    resetTavilyKeySession();
    invalidateTavilyAccountUsageCache();
  });

  it("loads all four numbered Tavily keys", () => {
    expect(getTavilyKeys().map((k) => k.id)).toEqual(["key-1", "key-2", "key-3", "key-4"]);
  });

  it("stays on the same key for successful searches across 4 keys", async () => {
    const searchKeys: string[] = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes("/usage")) {
        return jsonResponse(200, usagePayload(5));
      }
      const apiKey = searchApiKey(init);
      searchKeys.push(apiKey);
      return jsonResponse(200, {
        results: [{ title: "Acme", url: "https://acme.test", content: "Acme HQ" }],
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await tavilySearch("search one", 5);
    await tavilySearch("search two", 5);
    await tavilySearch("search three", 5);
    await tavilySearch("search four", 5);

    expect(searchKeys).toEqual([KEY_1, KEY_1, KEY_1, KEY_1]);
    expect(getTavilyKeys().map((k) => k.id)).toEqual(["key-1", "key-2", "key-3", "key-4"]);
  });

  it("fails over through key-2 and key-3 to key-4 when earlier keys hit quota", async () => {
    const searchKeys: string[] = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes("/usage")) {
        return jsonResponse(200, usagePayload(5));
      }
      const apiKey = searchApiKey(init);
      searchKeys.push(apiKey);
      if (apiKey === KEY_1 || apiKey === KEY_2 || apiKey === KEY_3) {
        return jsonResponse(432, { detail: { error: "usage limit exceeded" } });
      }
      return jsonResponse(200, {
        results: [{ title: "Lead", url: "https://linkedin.com/in/x", content: "Director at Acme" }],
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const hits = await tavilySearch("Acme LinkedIn Director", 5);
    expect(hits).toHaveLength(1);
    expect(searchKeys).toEqual([KEY_1, KEY_2, KEY_3, KEY_4]);
    expect(getNextTavilyKey()?.id).toBe("key-4");
  });
});

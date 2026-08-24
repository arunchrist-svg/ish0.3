import { describe, expect, it, beforeEach } from "vitest";
import { cachedFetch, clearFetchCache, getCached, setCached } from "@/lib/client-fetch-cache";

describe("client-fetch-cache", () => {
  beforeEach(() => {
    clearFetchCache();
  });

  it("returns cached value within TTL", async () => {
    setCached("k1", { ok: true }, 60_000);
    expect(getCached<{ ok: boolean }>("k1")).toEqual({ ok: true });
    const value = await cachedFetch("k1", async () => ({ ok: false }));
    expect(value).toEqual({ ok: true });
  });

  it("dedupes in-flight fetches", async () => {
    let calls = 0;
    const slow = () =>
      new Promise<{ n: number }>((resolve) => {
        calls += 1;
        setTimeout(() => resolve({ n: calls }), 20);
      });
    const [a, b] = await Promise.all([cachedFetch("inflight", slow), cachedFetch("inflight", slow)]);
    expect(a).toEqual(b);
    expect(calls).toBe(1);
  });

  it("force bypasses cache", async () => {
    setCached("force", 1, 60_000);
    const next = await cachedFetch("force", async () => 2, { force: true });
    expect(next).toBe(2);
  });
});

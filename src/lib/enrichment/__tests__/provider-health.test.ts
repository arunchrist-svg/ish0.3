import { beforeEach, describe, expect, it } from "vitest";
import {
  classifyProviderError,
  getProviderHealth,
  listDegradedProviders,
  markProviderDegraded,
  markProviderHealthy,
  noteProviderError,
  providerFromStepLabel,
  resetProviderHealth,
} from "@/lib/enrichment/provider-health";

beforeEach(() => resetProviderHealth());

describe("classifyProviderError", () => {
  it("recognises the Google Places daily quota error that took discovery down", () => {
    const err = new Error(
      "Quota exceeded for quota metric 'SearchTextRequest' and limit 'SearchTextRequest per day' of service 'places.googleapis.com'",
    );
    expect(classifyProviderError(err)).toBe("quota_exhausted");
  });

  it("separates auth failure, rate limit, and missing key", () => {
    expect(classifyProviderError(new Error("apollo 401 unauthorized"))).toBe("auth_failed");
    expect(classifyProviderError(new Error("429 Too Many Requests"))).toBe("rate_limited");
    expect(classifyProviderError(new Error("TAVILY_API_KEY not set"))).toBe("missing_key");
  });

  it("returns ok for errors that are not provider degradation", () => {
    expect(classifyProviderError(new Error("socket hang up"))).toBe("ok");
  });
});

describe("degradation lifecycle", () => {
  it("records a degraded provider and lists it", () => {
    markProviderDegraded("google_places", "quota_exhausted", "daily quota gone");
    expect(getProviderHealth("google_places")?.state).toBe("quota_exhausted");
    expect(listDegradedProviders().map((h) => h.provider)).toEqual(["google_places"]);
  });

  it("expires a rate limit after its short TTL but keeps a daily quota until IST midnight", () => {
    const now = Date.UTC(2026, 0, 15, 6, 0, 0); // 11:30 IST
    markProviderDegraded("apollo", "rate_limited", "429", now);
    markProviderDegraded("google_places", "quota_exhausted", "daily quota", now);

    const later = now + 6 * 60 * 1000; // +6 min
    expect(getProviderHealth("apollo", later)).toBeNull();
    expect(getProviderHealth("google_places", later)?.state).toBe("quota_exhausted");

    const nextDay = now + 24 * 60 * 60 * 1000;
    expect(getProviderHealth("google_places", nextDay)).toBeNull();
  });

  it("never caches a missing key: the env can gain one without an error first", () => {
    markProviderDegraded("tavily_ai", "missing_key", "no key");
    expect(getProviderHealth("tavily_ai")).toBeNull();
  });

  it("clears on demand and preserves the original since across repeat errors", () => {
    const now = Date.UTC(2026, 0, 15, 6, 0, 0);
    markProviderDegraded("apollo", "rate_limited", "first", now);
    markProviderDegraded("apollo", "rate_limited", "second", now + 60_000);
    expect(getProviderHealth("apollo", now + 60_000)?.since).toBe(now);

    markProviderHealthy("apollo");
    expect(getProviderHealth("apollo")).toBeNull();
  });

  it("noteProviderError ignores non-degradation errors", () => {
    noteProviderError("apollo", new Error("socket hang up"));
    expect(listDegradedProviders()).toEqual([]);

    noteProviderError("apollo", new Error("quota exceeded"));
    expect(listDegradedProviders()).toHaveLength(1);
  });
});

describe("providerFromStepLabel", () => {
  it("maps every waterfall step label back to its provider", () => {
    expect(providerFromStepLabel("google_places")).toBe("google_places");
    expect(providerFromStepLabel("google_places_fallback")).toBe("google_places");
    expect(providerFromStepLabel("google_places_focus")).toBe("google_places");
    expect(providerFromStepLabel("india_directories_more")).toBe("india_directories");
    expect(providerFromStepLabel("apollo")).toBe("apollo");
    expect(providerFromStepLabel("tavily_ai_fallback")).toBe("tavily_ai");
    expect(providerFromStepLabel("name_search_tavily")).toBe("tavily_ai");
  });

  it("returns null for a step that is not a provider call", () => {
    expect(providerFromStepLabel("city_filter")).toBeNull();
  });
});

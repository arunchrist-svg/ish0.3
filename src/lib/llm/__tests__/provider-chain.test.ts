import { afterEach, describe, expect, it } from "vitest";
import {
  markGeminiKeyRejected,
  providersToAttempt,
  resetLLMProviderSession,
} from "@/lib/llm/provider-chain";

describe("providersToAttempt", () => {
  afterEach(() => {
    resetLLMProviderSession();
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY_2;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
  });

  it("prefers gemini when configured", () => {
    process.env.GEMINI_API_KEY = "g1";
    process.env.ANTHROPIC_API_KEY = "a1";
    delete process.env.OPENROUTER_API_KEY;
    expect(providersToAttempt()).toEqual(["gemini", "anthropic"]);
  });

  it("honors explicit provider first then rotates through defaults", () => {
    process.env.GEMINI_API_KEY = "g1";
    process.env.OPENROUTER_API_KEY = "o1";
    expect(providersToAttempt("openrouter")).toEqual(["openrouter", "gemini"]);
  });

  it("skips rejected gemini keys until provider is exhausted", () => {
    process.env.GEMINI_API_KEY = "g1";
    process.env.GEMINI_API_KEY_2 = "g2";
    markGeminiKeyRejected("gemini-1");
    expect(providersToAttempt()).toEqual(["gemini"]);
  });
});

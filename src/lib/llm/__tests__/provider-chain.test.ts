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
    delete process.env.LOCAL_LLM_ENABLED;
    delete process.env.LOCAL_LLM_BASE_URL;
  });

  it("prefers OpenRouter then Claude, and does not use Gemini for chat", () => {
    process.env.GEMINI_API_KEY = "g1";
    process.env.ANTHROPIC_API_KEY = "a1";
    process.env.OPENROUTER_API_KEY = "o1";
    delete process.env.LOCAL_LLM_ENABLED;
    delete process.env.LOCAL_LLM_BASE_URL;
    expect(providersToAttempt()).toEqual(["openrouter", "anthropic"]);
  });

  it("ignores Gemini even when it is requested first", () => {
    process.env.GEMINI_API_KEY = "g1";
    process.env.OPENROUTER_API_KEY = "o1";
    expect(providersToAttempt("gemini")).toEqual(["openrouter"]);
  });

  it("honors explicit OpenRouter first then rotates through chat defaults", () => {
    process.env.GEMINI_API_KEY = "g1";
    process.env.OPENROUTER_API_KEY = "o1";
    expect(providersToAttempt("openrouter")).toEqual(["openrouter"]);
  });

  it("skips rejected gemini keys until provider is exhausted", () => {
    process.env.GEMINI_API_KEY = "g1";
    process.env.GEMINI_API_KEY_2 = "g2";
    markGeminiKeyRejected("gemini-1");
    expect(providersToAttempt()).toEqual([]);
  });
});

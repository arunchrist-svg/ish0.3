import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_LOCAL_LLM_BASE_URL,
  localLlmBaseUrl,
  localLlmEnabled,
  resetLocalLlmModelCache,
} from "@/lib/llm/local-llm";
import { providersToAttempt, resetLLMProviderSession } from "@/lib/llm/provider-chain";

describe("local LLM", () => {
  afterEach(() => {
    resetLLMProviderSession();
    resetLocalLlmModelCache();
    delete process.env.LOCAL_LLM_ENABLED;
    delete process.env.LOCAL_LLM_BASE_URL;
    delete process.env.LOCAL_LLM_MODEL;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GEMINI_API_KEY;
  });

  it("is off unless enabled or a base URL is set", () => {
    delete process.env.LOCAL_LLM_ENABLED;
    delete process.env.LOCAL_LLM_BASE_URL;
    delete process.env.LOCAL_LLM_MODEL;
    expect(localLlmEnabled()).toBe(false);
    process.env.LOCAL_LLM_ENABLED = "true";
    expect(localLlmEnabled()).toBe(true);
    expect(localLlmBaseUrl()).toBe(DEFAULT_LOCAL_LLM_BASE_URL);
  });

  it("treats LOCAL_LLM_BASE_URL as on", () => {
    process.env.LOCAL_LLM_BASE_URL = "http://127.0.0.1:1234/v1/";
    expect(localLlmEnabled()).toBe(true);
    expect(localLlmBaseUrl()).toBe("http://127.0.0.1:1234/v1");
  });

  it("goes first in the chat chain when enabled", () => {
    process.env.LOCAL_LLM_ENABLED = "1";
    process.env.OPENROUTER_API_KEY = "o1";
    process.env.ANTHROPIC_API_KEY = "a1";
    process.env.GEMINI_API_KEY = "g1";
    expect(providersToAttempt()).toEqual(["local", "openrouter", "anthropic"]);
  });
});

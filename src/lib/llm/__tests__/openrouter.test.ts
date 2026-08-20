import { afterEach, describe, expect, it } from "vitest";
import { friendlyLLMError } from "@/lib/llm";
import {
  DEFAULT_OPENROUTER_MODEL,
  ensureOpenRouterApiKey,
  getOpenRouterKeys,
  hasOpenRouterKey,
  openrouterModelId,
  openrouterModelsToAttempt,
} from "@/lib/llm/openrouter";

describe("openrouter helpers", () => {
  const prevKey = process.env.OPENROUTER_API_KEY;
  const prevKey2 = process.env.OPENROUTER_API_KEY_2;
  const prevKey3 = process.env.OPENROUTER_API_KEY_3;
  const prevKeys = process.env.OPENROUTER_API_KEYS;
  const prevModel = process.env.OPENROUTER_MODEL;

  afterEach(() => {
    if (prevKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = prevKey;
    if (prevKey2 === undefined) delete process.env.OPENROUTER_API_KEY_2;
    else process.env.OPENROUTER_API_KEY_2 = prevKey2;
    if (prevKey3 === undefined) delete process.env.OPENROUTER_API_KEY_3;
    else process.env.OPENROUTER_API_KEY_3 = prevKey3;
    if (prevKeys === undefined) delete process.env.OPENROUTER_API_KEYS;
    else process.env.OPENROUTER_API_KEYS = prevKeys;
    if (prevModel === undefined) delete process.env.OPENROUTER_MODEL;
    else process.env.OPENROUTER_MODEL = prevModel;
  });

  it("defaults to a fast free model, not the openrouter/free queue", () => {
    delete process.env.OPENROUTER_MODEL;
    expect(openrouterModelId()).toBe(DEFAULT_OPENROUTER_MODEL);
    expect(DEFAULT_OPENROUTER_MODEL).toBe("openai/gpt-oss-20b:free");
  });

  it("does not lead with openrouter/free even if that is configured", () => {
    process.env.OPENROUTER_MODEL = "openrouter/free";
    expect(openrouterModelsToAttempt()[0]).toBe(DEFAULT_OPENROUTER_MODEL);
  });

  it("requires OPENROUTER_API_KEY", () => {
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY_2;
    delete process.env.OPENROUTER_API_KEY_3;
    delete process.env.OPENROUTER_API_KEYS;
    expect(hasOpenRouterKey()).toBe(false);
    expect(() => ensureOpenRouterApiKey()).toThrow(/OPENROUTER_API_KEY is missing/);
  });

  it("loads numbered OpenRouter fallback keys", () => {
    process.env.OPENROUTER_API_KEY = "sk-or-v1-aaa";
    process.env.OPENROUTER_API_KEY_2 = "sk-or-v1-bbb";
    delete process.env.OPENROUTER_API_KEY_3;
    delete process.env.OPENROUTER_API_KEYS;
    expect(getOpenRouterKeys().map((k) => k.id)).toEqual(["openrouter-1", "openrouter-2"]);
  });

  it("explains missing OpenRouter key for AI Writer", () => {
    expect(friendlyLLMError(new Error("OPENROUTER_API_KEY is missing. Add it in .env.local to use AI Writer."))).toBe(
      "Add OPENROUTER_API_KEY in .env.local to use AI Writer.",
    );
  });
});

/**
 * Public-web search hits in the same shape Tavily returns.
 * Tavily first when credits remain; Gemini Google Search grounding when they do not.
 *
 * People search uses the Gemini REST generateContent + googleSearch tool. The AI SDK
 * path rejects gemini-2.5-flash for these keys even though REST grounding works.
 */
import { geminiModelId } from "@/lib/llm/gemini-env";
import {
  getAvailableGeminiKeys,
  isLLMQuotaOrAuthError,
  markGeminiKeyRejected,
} from "@/lib/llm/provider-chain";
import { hasTavilyKey } from "./discovery-prerequisites";
import {
  isTavilyQuotaError,
  tavilySearch,
  type TavilyHit,
} from "./tavily-client";

export type WebSearchHit = TavilyHit;

export type GroundingChunkLike = {
  web?: { uri?: string | null; title?: string | null } | null;
  retrievedContext?: {
    uri?: string | null;
    title?: string | null;
    text?: string | null;
  } | null;
};

export type GroundingSupportLike = {
  segment?: { text?: string | null } | null;
  groundingChunkIndices?: number[] | null;
};

export type GroundingMetadataLike = {
  groundingChunks?: GroundingChunkLike[] | null;
  groundingSupports?: GroundingSupportLike[] | null;
};

function normalizeHit(hit: WebSearchHit): WebSearchHit | null {
  const url = hit.url?.trim();
  if (!url || !/^https?:\/\//i.test(url)) return null;
  return {
    title: (hit.title ?? "").trim() || url,
    url,
    content: (hit.content ?? "").trim(),
  };
}

function supportTextForChunk(
  supports: GroundingSupportLike[],
  chunkIndex: number,
): string {
  return supports
    .filter((row) => (row.groundingChunkIndices ?? []).includes(chunkIndex))
    .map((row) => row.segment?.text?.trim() ?? "")
    .filter(Boolean)
    .join(" ");
}

/** Map Gemini grounding metadata into Tavily-shaped search hits. */
export function mapGroundingMetadataToHits(
  metadata: GroundingMetadataLike | null | undefined,
  fallbackText = "",
): WebSearchHit[] {
  const chunks = metadata?.groundingChunks ?? [];
  const supports = metadata?.groundingSupports ?? [];
  const out: WebSearchHit[] = [];
  const seen = new Set<string>();

  const push = (hit: WebSearchHit) => {
    const normalized = normalizeHit(hit);
    if (!normalized) return;
    const key = normalized.url.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(normalized);
  };

  chunks.forEach((chunk, index) => {
    const web = chunk.web;
    if (web?.uri) {
      push({
        title: web.title ?? "",
        url: web.uri,
        content: supportTextForChunk(supports, index) || fallbackText.slice(0, 800),
      });
    }
    const retrieved = chunk.retrievedContext;
    if (retrieved?.uri) {
      push({
        title: retrieved.title ?? "",
        url: retrieved.uri,
        content: retrieved.text?.trim() || supportTextForChunk(supports, index) || fallbackText.slice(0, 800),
      });
    }
  });

  for (const match of fallbackText.matchAll(/https?:\/\/[^\s)\]>'"]+/gi)) {
    const url = match[0].replace(/[.,;]+$/, "");
    push({ title: url, url, content: fallbackText.slice(0, 800) });
  }

  return out;
}

function sourcesToHits(sources: Array<{ url?: string; title?: string }> | undefined): WebSearchHit[] {
  if (!sources?.length) return [];
  return sources
    .map((source) =>
      normalizeHit({
        title: source.title ?? "",
        url: source.url ?? "",
        content: "",
      }),
    )
    .filter((hit): hit is WebSearchHit => Boolean(hit));
}

function geminiSearchModels(): string[] {
  const preferred = geminiModelId("quality");
  return [...new Set(["gemini-2.5-flash", preferred, "gemini-3.6-flash", "gemini-3.5-flash"])];
}

function isGeminiModelUnavailable(message: string): boolean {
  return /no longer available|not found|not available to new users|NOT_FOUND|404/i.test(message);
}

async function geminiRestGroundedSearch(
  apiKey: string,
  model: string,
  query: string,
): Promise<{ hits: WebSearchHit[]; error?: string; status: number }> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const prompt = `Search the public web for this exact query. Quote titles, URLs, and snippets you found. Do not invent people, employers, emails, or URLs that are not in the search results.

Query: ${query}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 1600 },
      tools: [{ googleSearch: {} }],
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    error?: { message?: string };
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
      groundingMetadata?: GroundingMetadataLike;
    }>;
  };
  if (!res.ok) {
    return { hits: [], status: res.status, error: data.error?.message || `HTTP ${res.status}` };
  }
  const candidate = data.candidates?.[0];
  const text = candidate?.content?.parts?.map((part) => part.text).filter(Boolean).join("\n") ?? "";
  const hits = mapGroundingMetadataToHits(candidate?.groundingMetadata, text);
  return { hits, status: res.status };
}

export async function geminiGroundedSearch(query: string, limit = 8): Promise<WebSearchHit[]> {
  const keys = getAvailableGeminiKeys();
  if (!keys.length) throw new Error("GEMINI_API_KEY is missing");

  let lastError: unknown;
  for (const keyEntry of keys) {
    for (const model of geminiSearchModels()) {
      try {
        const result = await geminiRestGroundedSearch(keyEntry.key, model, query);
        if (result.error) {
          lastError = new Error(result.error);
          if (isGeminiModelUnavailable(result.error)) continue;
          if (/401|invalid.?api.?key|unauthorized|API_KEY_INVALID/i.test(result.error)) {
            markGeminiKeyRejected(keyEntry.id);
            break;
          }
          continue;
        }
        return result.hits.slice(0, Math.max(1, limit));
      } catch (error) {
        lastError = error;
        const message = error instanceof Error ? error.message : String(error);
        if (isGeminiModelUnavailable(message)) continue;
        if (isLLMQuotaOrAuthError(error)) {
          markGeminiKeyRejected(keyEntry.id);
          break;
        }
        throw error;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Gemini web search failed");
}

export const webSearchBackends = {
  tavily: tavilySearch,
  gemini: geminiGroundedSearch,
};

export function canSearchPeopleOnWeb(): boolean {
  return hasTavilyKey() || getAvailableGeminiKeys().length > 0;
}

/**
 * Tavily when credits remain. Gemini Google Search when Tavily is missing or out of plan credits.
 */
export async function searchWeb(query: string, limit = 8): Promise<WebSearchHit[]> {
  const geminiReady = () => getAvailableGeminiKeys().length > 0;

  if (hasTavilyKey()) {
    try {
      return await webSearchBackends.tavily(query, limit);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isTavilyQuotaError(message) && geminiReady()) {
        console.warn("[web-search] Tavily quota, using Gemini Google Search:", query);
        try {
          return await webSearchBackends.gemini(query, limit);
        } catch (geminiError) {
          if (!geminiReady()) throw error;
          throw geminiError;
        }
      }
      throw error;
    }
  }

  if (geminiReady()) {
    return webSearchBackends.gemini(query, limit);
  }

  throw new Error("TAVILY_API_KEY not set");
}

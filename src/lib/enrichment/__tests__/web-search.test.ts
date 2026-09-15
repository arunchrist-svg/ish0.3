import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TavilyQuotaError } from "@/lib/enrichment/tavily-client";
import {
  mapGroundingMetadataToHits,
  searchWeb,
  webSearchBackends,
} from "@/lib/enrichment/web-search";

describe("mapGroundingMetadataToHits", () => {
  it("maps grounding chunks and support snippets to Tavily-shaped hits", () => {
    const hits = mapGroundingMetadataToHits(
      {
        groundingChunks: [
          { web: { uri: "https://www.linkedin.com/in/priya-sharma-hr", title: "Priya Sharma | HR Director" } },
          { retrievedContext: { uri: "https://hrkatha.com/infosys-chro", title: "Infosys appoints CHRO", text: "Infosys appointed Priya Sharma as CHRO." } },
        ],
        groundingSupports: [
          {
            segment: { text: "Priya Sharma is HR Director at Infosys in Bengaluru." },
            groundingChunkIndices: [0],
          },
        ],
      },
      "See also https://example.com/ignored-if-dup",
    );

    expect(hits[0]).toEqual({
      title: "Priya Sharma | HR Director",
      url: "https://www.linkedin.com/in/priya-sharma-hr",
      content: "Priya Sharma is HR Director at Infosys in Bengaluru.",
    });
    expect(hits[1]?.url).toBe("https://hrkatha.com/infosys-chro");
    expect(hits[1]?.content).toContain("Priya Sharma");
  });

  it("drops non-http URLs", () => {
    const hits = mapGroundingMetadataToHits({
      groundingChunks: [{ web: { uri: "javascript:alert(1)", title: "x" } }],
    });
    expect(hits).toEqual([]);
  });
});

describe("searchWeb Tavily quota fallback", () => {
  const original = { ...webSearchBackends };

  beforeEach(() => {
    vi.stubEnv("TAVILY_API_KEY", "tvly-test");
    vi.stubEnv("GEMINI_API_KEY", "gemini-test");
    webSearchBackends.tavily = vi.fn(async () => {
      throw new TavilyQuotaError();
    });
    webSearchBackends.gemini = vi.fn(async () => [
      {
        title: "Anita Rao | Head of HR | LinkedIn",
        url: "https://www.linkedin.com/in/anita-rao-hr",
        content: "Head of HR at Acme Bengaluru",
      },
    ]);
  });

  afterEach(() => {
    Object.assign(webSearchBackends, original);
    vi.unstubAllEnvs();
  });

  it("uses Gemini search when Tavily is out of credits", async () => {
    const hits = await searchWeb("Head of HR Acme Bengaluru", 5);
    expect(webSearchBackends.gemini).toHaveBeenCalledOnce();
    expect(hits[0]?.url).toContain("anita-rao-hr");
  });
});

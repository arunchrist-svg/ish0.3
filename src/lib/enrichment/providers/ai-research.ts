import { callLLM } from "@/lib/llm";
import { parseJsonObjectFromLLM } from "@/lib/llm/parse-json";
import { hasGeminiKey, hasTavilyKey } from "../discovery-prerequisites";
import { tavilySearch } from "../tavily-client";
import type { EnrichmentInput, EnrichmentProvider, EnrichmentResult } from "../enrich-types";
import { sanitizeEmail, sanitizePhone } from "../validate-contact";

export const aiResearchProvider: EnrichmentProvider = {
  id: "ai_research",
  name: "AI Web Research",
  capabilities: ["enrich"],
  isConfigured: () => hasTavilyKey() && hasGeminiKey(),

  async enrich(input: EnrichmentInput): Promise<EnrichmentResult | null> {
    if (!hasTavilyKey() || !hasGeminiKey()) return null;

    const query = `"${input.name}" "${input.company}" ${input.title ?? ""} email phone contact India`;
    const results = await tavilySearch(query, 6).catch(() => []);
    if (!results.length) return null;

    const context = results
      .slice(0, 8)
      .map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.content.slice(0, 400)}`)
      .join("\n\n");

    try {
      const raw = await callLLM({
        tier: "fast",
        system: `Extract contact info ONLY if explicitly present in search results.
Output ONLY valid JSON: { "email": string | null, "phone": string | null, "linkedinUrl": string | null, "title": string | null }
Never invent emails or phones.`,
        prompt: `Person: ${input.name}\nCompany: ${input.company}\nTitle: ${input.title ?? "unknown"}\n\n${context}`,
        maxTokens: 256,
      });
      const parsed = parseJsonObjectFromLLM(raw);
      const email = sanitizeEmail(parsed.email as string | undefined);
      const phone = sanitizePhone(parsed.phone as string | undefined);
      const linkedinUrl = typeof parsed.linkedinUrl === "string" ? parsed.linkedinUrl : input.linkedinUrl;
      const title = typeof parsed.title === "string" && parsed.title.trim() ? parsed.title.trim() : input.title;
      if (!email && !phone) return null;

      return {
        providerId: "ai_research",
        contact: {
          name: input.name,
          title,
          company: input.company,
          city: input.city,
          email,
          phone,
          linkedinUrl,
        },
      };
    } catch (e) {
      console.error("[ai-research] failed:", e);
      return null;
    }
  },
};

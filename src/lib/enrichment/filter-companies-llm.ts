/**
 * LLM gate: drop area names, buildings, floors, and other non-companies
 * that slipped past heuristic cleanCompanyName.
 * Uses Gemini first (with provider rotation on quota).
 */
import { callLLM, type LLMProvider } from "@/lib/llm";
import { hasGeminiKeys } from "@/lib/llm/gemini-keys";
import { hasAnthropicKey, isProviderConfigured } from "@/lib/llm/provider-chain";
import { hasOpenRouterKey } from "@/lib/llm/openrouter";
import { llmErrorMessage } from "./discovery-prerequisites";
import { cleanCompanyName } from "./directory-parser";
import { isGeographicEntity } from "./company-name-match";
import { isAcceptableCompanyDomain } from "./company-domain-quality";
import { icpCompanyFilterInstructions } from "@/lib/brand/platform-intent";
import type { PlatformIntent } from "@/lib/brand/platform-intent";

const BATCH_SIZE = 40;

export type CompanyNameFilterMeta = {
  warnings?: string[];
  icpSummary?: string | null;
  platformIntent?: PlatformIntent | null;
  productSummary?: string | null;
};

/** Prefer Gemini for scout cleanup. Never returns anthropic as the explicit first hop. */
export function freeCompanyFilterProvider(): LLMProvider | null {
  if (hasGeminiKeys()) return "gemini";
  if (hasOpenRouterKey()) return "openrouter";
  return null;
}

export function hasScoutLlmProvider(): boolean {
  return isProviderConfigured("gemini") || isProviderConfigured("openrouter") || hasAnthropicKey();
}

function stripCodeFences(raw: string): string {
  return raw
    .replace(/^```(?:json|JSON)?\s*\n?/m, "")
    .replace(/\n?```\s*$/m, "")
    .trim();
}

function normalizeKeepName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = cleanCompanyName(raw.trim());
  if (!cleaned || isGeographicEntity(cleaned)) return null;
  return cleaned;
}

function extractJsonArrayText(raw: string): string {
  const cleaned = stripCodeFences(raw.trim());
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start >= 0 && end > start) return cleaned.slice(start, end + 1);
  return cleaned;
}

/**
 * Parse LLM JSON into cleaned company names to keep.
 * Accepts ["Acme Pvt Ltd", ...] or [{ "name": "Acme", "keep": true }, ...].
 */
export function parseCompanyFilterKeepNames(raw: string): string[] {
  const text = extractJsonArrayText(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = JSON.parse(text.replace(/,\s*([}\]])/g, "$1"));
  }

  const items = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object"
      ? ((parsed as Record<string, unknown>).companies ??
          (parsed as Record<string, unknown>).keep ??
          (parsed as Record<string, unknown>).names ??
          [])
      : [];

  if (!Array.isArray(items)) throw new Error("LLM company filter did not return an array");

  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    let candidate: string | null = null;
    if (typeof item === "string") {
      candidate = normalizeKeepName(item);
    } else if (item && typeof item === "object") {
      const row = item as Record<string, unknown>;
      if (row.keep === false) continue;
      candidate = normalizeKeepName(row.name ?? row.company ?? row.cleaned);
    }
    if (!candidate) continue;
    const key = candidate.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(candidate);
  }
  return out;
}

async function filterBatch(
  names: string[],
  icpBlock?: string | null,
): Promise<string[]> {
  if (!names.length) return [];
  const numbered = names.map((name, i) => `${i + 1}. ${name}`).join("\n");
  const icp = icpBlock?.trim()
    ? `\n${icpBlock.trim()}`
    : "";
  const raw = await callLLM({
    tier: "fast",
    provider: freeCompanyFilterProvider() ?? undefined,
    system: `You filter B2B scout candidate names for India.
Return ONLY a JSON array of strings: the real company / brand names to KEEP.
Drop anything that is not a company: neighborhoods, cities, states, hobli, industrial areas, buildings, towers, floors, levels, tech parks, UI labels, job categories, NIC activity lines, or address fragments.
If a string mixes a company with a place or floor (e.g. "Acme Pvt Ltd in Dairy Circle" or "Acme Pvt Ltd Doddakakundi Industrial Area"), return only the cleaned company name ("Acme Pvt Ltd").
${icp}
Do not invent companies. Do not explain.`,
    prompt: `Keep only real buyer companies from this list. Return a JSON array of cleaned company name strings.

${numbered}`,
    maxTokens: 1536,
  });
  return parseCompanyFilterKeepNames(raw);
}

/**
 * Skip the free-model name gate when candidates already look like real companies
 * (website/domain present, no junk tokens) and we have enough for the Scout limit.
 */
export function shouldSkipCompaniesLlmFilter(
  companies: { name: string; website?: string | null; domain?: string | null }[],
  limit: number,
): boolean {
  if (!companies.length || companies.length < limit) return false;
  const sample = companies.slice(0, Math.min(companies.length, Math.max(limit, 8)));
  let clean = 0;
  for (const company of sample) {
    const name = company.name?.trim() ?? "";
    if (!name || isGeographicEntity(name)) continue;
    const cleaned = cleanCompanyName(name);
    if (!cleaned || cleaned.toLowerCase() !== name.toLowerCase()) continue;
    if (!isAcceptableCompanyDomain(company.website || company.domain, name)) continue;
    if (/\b(floor|tower|building|tech park|industrial area|hobli|salary|culture)\b/i.test(name)) {
      continue;
    }
    clean += 1;
  }
  return clean >= Math.ceil(sample.length * 0.7);
}

/**
 * LLM-filter companies via free models. On failure, missing key, or a 100% wipe,
 * returns the input unchanged so the pipeline never silently empties.
 */
export async function filterCompaniesWithLlm<T extends { name: string }>(
  companies: T[],
  meta?: CompanyNameFilterMeta,
): Promise<T[]> {
  if (!companies.length) return companies;
  if (!hasScoutLlmProvider()) {
    meta?.warnings?.push("No LLM configured (GEMINI_API_KEY) — showing unfiltered candidates.");
    return companies;
  }

  const byLower = new Map<string, T>();
  for (const company of companies) {
    const key = company.name.trim().toLowerCase();
    if (key && !byLower.has(key)) byLower.set(key, company);
  }
  const uniqueNames = [...byLower.keys()].map((key) => byLower.get(key)!.name);

  const kept: T[] = [];
  const keptKeys = new Set<string>();

  const icpBlock = icpCompanyFilterInstructions({
    platformIntent: meta?.platformIntent,
    icpSummary: meta?.icpSummary,
    productSummary: meta?.productSummary,
  });

  try {
    for (let i = 0; i < uniqueNames.length; i += BATCH_SIZE) {
      const batch = uniqueNames.slice(i, i + BATCH_SIZE);
      const keepNames = await filterBatch(batch, icpBlock);
      for (const keepName of keepNames) {
        const key = keepName.toLowerCase();
        if (keptKeys.has(key)) continue;
        const original = byLower.get(key);
        if (original) {
          keptKeys.add(key);
          kept.push(original);
          continue;
        }
        const source =
          batch.find((n) => {
            const cleaned = cleanCompanyName(n);
            return cleaned?.toLowerCase() === key || n.toLowerCase().startsWith(key);
          }) ?? batch.find((n) => n.toLowerCase().includes(key));
        if (!source) continue;
        const base = byLower.get(source.toLowerCase());
        if (!base) continue;
        keptKeys.add(key);
        kept.push({ ...base, name: keepName });
      }
    }
    // A 100% wipe is almost always the model being over-strict, not a real signal.
    if (!kept.length) {
      meta?.warnings?.push(
        `AI company filter kept 0 of ${companies.length} candidates — showing unfiltered results.`,
      );
      return companies;
    }
    return kept;
  } catch (e) {
    console.error("[filter-companies-llm] failed:", e);
    meta?.warnings?.push(
      llmErrorMessage(e) || "AI company-name filter failed — showing unfiltered candidates.",
    );
    return companies;
  }
}

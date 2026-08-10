import { callLLM } from "@/lib/llm";
import { parseJsonObjectFromLLM } from "@/lib/llm/parse-json";
import type { BrandConfig, WebsiteBrandInsights } from "@/lib/email/config";
import { SCOUT_DEPARTMENTS, SCOUT_INDUSTRIES, SCOUT_SENIORITY } from "@/lib/scouting-data";
import {
  inferPlatformIntent,
  scoutDefaultsForIntent,
  verticalPackIdForIntent,
  type PlatformIntent,
} from "@/lib/brand/platform-intent";
import { INDUSTRY_CATALOG, inferProductCategory } from "@/lib/brand-intel/industry-catalog";
import { normalizeEmailKeywords, writeupFromSummary } from "@/lib/brand/email-keywords";

const PAGE_PATHS = ["/", "/about", "/about-us", "/products", "/product", "/services", "/solutions"];

const INDUSTRY_SET = new Set(SCOUT_INDUSTRIES.map((i) => i.toLowerCase()));
const DEPARTMENT_SET = new Set(SCOUT_DEPARTMENTS.map((d) => d.toLowerCase()));
const SENIORITY_SET = new Set(SCOUT_SENIORITY.map((s) => s.toLowerCase()));

export function normalizeWebsiteUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let url = trimmed;
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes(".")) return null;
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

async function fetchPage(url: string, timeoutMs = 8000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; ISH-BrandBot/1.0)",
        Accept: "text/html",
      },
      redirect: "follow",
    });
    if (!res.ok) return "";
    return (await res.text()).slice(0, 100_000);
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

async function collectWebsiteText(baseUrl: string): Promise<string> {
  const chunks: string[] = [];
  for (const path of PAGE_PATHS) {
    const url = path === "/" ? baseUrl : `${baseUrl}${path}`;
    const html = await fetchPage(url);
    if (!html) continue;
    const text = htmlToText(html);
    if (text.length < 80) continue;
    chunks.push(`--- Page: ${path} ---\n${text.slice(0, 6000)}`);
    if (chunks.join("\n").length > 18_000) break;
  }
  return chunks.join("\n\n").slice(0, 20_000);
}

function pickFromCatalog(raw: unknown, catalog: readonly string[], set: Set<string>, max: number): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    const s = String(item ?? "").trim();
    if (!s) continue;
    const match = catalog.find((c) => c.toLowerCase() === s.toLowerCase());
    if (match && !out.includes(match)) out.push(match);
    else if (set.has(s.toLowerCase()) && !out.includes(s)) out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

function stringList(raw: unknown, max: number): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((v) => String(v ?? "").trim())
    .filter(Boolean)
    .slice(0, max);
}

export { normalizeEmailKeywords, writeupFromSummary } from "@/lib/brand/email-keywords";

export type AnalyzeSellerWebsiteResult = {
  websiteUrl: string;
  insights: WebsiteBrandInsights;
  /** BrandConfig fields ready to merge (custom slug). */
  brandPatch: Partial<BrandConfig>;
  platformIntent: PlatformIntent;
  productCategory: string | null;
};

export async function analyzeSellerWebsite(params: {
  websiteUrl: string;
  orgName?: string;
  tenantId?: string;
  workspaceId?: string;
  /** Explicit client intent from onboarding / Settings; otherwise inferred from the site. */
  platformIntent?: PlatformIntent;
}): Promise<AnalyzeSellerWebsiteResult> {
  const websiteUrl = normalizeWebsiteUrl(params.websiteUrl);
  if (!websiteUrl) {
    throw new Error("Enter a valid website URL (e.g. https://acme.com)");
  }

  const pageText = await collectWebsiteText(websiteUrl);
  if (pageText.length < 120) {
    throw new Error("Could not read enough content from that website. Check the URL and try again.");
  }

  const industryList = SCOUT_INDUSTRIES.join(", ");
  const deptList = SCOUT_DEPARTMENTS.join(", ");
  const senList = SCOUT_SENIORITY.join(", ");
  const categoryList = INDUSTRY_CATALOG.map((e) => e.label).join(", ");

  const prompt = `Analyze this seller company's website and extract brand/outreach profile for B2B cold email and prospect scouting.

Company name hint: ${params.orgName?.trim() || "(unknown)"}
Website: ${websiteUrl}
${params.platformIntent ? `Stated platform use: ${params.platformIntent}` : ""}

Website content:
"""
${pageText}
"""

Return ONLY valid JSON:
{
  "brandName": "official brand/company name",
  "vertical": "short snake_case vertical e.g. sweets_gifting, appliances, saas, manufacturing, consulting",
  "platformIntent": "b2b_saas | corporate_gifting | appliances | general_b2b",
  "productCategory": "ONE catalog label: ${categoryList}",
  "productSummary": "2-4 sentences: what they sell, who buys, key offers/pricing if stated. Concrete, no fluff.",
  "productWriteup": "2-3 sentences positioning blurb for cold email: what they sell, who it is for, why it matters. No fluff.",
  "emailKeywords": ["5-8 short phrases Writer should lean on, e.g. bulk Diwali hampers, custom branded boxes, pan-India delivery"],
  "toneNotes": "1-2 sentences: how outreach email should sound for this brand (vocabulary, formality, angles to use/avoid)",
  "buyerPersonas": ["role titles who typically buy, e.g. VP Sales or HR Director"],
  "valueProposition": "one sentence core value for buyers",
  "differentiators": ["up to 3 concrete differentiators from the site"],
  "scoutIndustries": ["industries of IDEAL BUYER companies, ONLY from: ${industryList}"],
  "scoutDepartments": ["buyer departments to find, ONLY from: ${deptList}"],
  "scoutSeniority": ["buyer seniority to find, ONLY from: ${senList}"]
}

Rules:
- platformIntent = what they would use Nebula for: SaaS/software sales → b2b_saas; mithai/hampers/corporate gifts → corporate_gifting; kitchen appliances/corporate rewards → appliances; otherwise general_b2b.
- productCategory = what THEY sell (seller catalog), not buyer industry. Must be one catalog label.
- scoutIndustries = who they SELL TO (buyer industries), not the seller's own industry unless B2B peer sales.
- Prefer 1-4 scoutIndustries, 1-3 departments, 1-3 seniority levels.
- productSummary, productWriteup, and toneNotes must be grounded in the website text.
- emailKeywords = concrete offer/occasion/proof/logistics phrases. Never spam words like free, guaranteed, act now.
- Match buyer personas and scout roles to how this company actually sells (SaaS → sales/leadership buyers; gifting → HR/procurement).
- Never invent competitor brands or fake stats.`;

  const raw = await callLLM({
    tier: "quality",
    system: "You output only valid JSON. No markdown fences, no commentary.",
    prompt,
    maxTokens: 2048,
    trace:
      params.tenantId && params.workspaceId
        ? {
            tenantId: params.tenantId,
            workspaceId: params.workspaceId,
            agent: "brand_website_analyze",
            promptVersion: "seller-website-v3-writeup-keywords",
          }
        : undefined,
  });

  let parsed: Record<string, unknown>;
  try {
    parsed = parseJsonObjectFromLLM(raw);
  } catch {
    // Retry once with a shorter extract if the first response was truncated or malformed
    try {
      const retryRaw = await callLLM({
        tier: "fast",
        system: "You output only valid JSON. No markdown fences, no commentary.",
        prompt: `${prompt}\n\nKeep every string short. Return a compact JSON object only.`,
        maxTokens: 1200,
      });
      parsed = parseJsonObjectFromLLM(retryRaw);
    } catch {
      throw new Error("Website analysis failed to return structured data. Try again.");
    }
  }

  const brandName =
    (parsed.brandName != null ? String(parsed.brandName).trim() : "") ||
    params.orgName?.trim() ||
    undefined;
  const vertical =
    (parsed.vertical != null ? String(parsed.vertical).trim().toLowerCase().replace(/\s+/g, "_") : "") ||
    "general";
  const productSummary =
    parsed.productSummary != null ? String(parsed.productSummary).trim() : "";
  const productWriteup =
    (parsed.productWriteup != null ? String(parsed.productWriteup).trim() : "") ||
    writeupFromSummary(productSummary);
  const emailKeywords = normalizeEmailKeywords(parsed.emailKeywords);
  const toneNotes = parsed.toneNotes != null ? String(parsed.toneNotes).trim() : "";
  const buyerPersonas = stringList(parsed.buyerPersonas, 5);
  const valueProposition =
    parsed.valueProposition != null ? String(parsed.valueProposition).trim() : undefined;
  const differentiators = stringList(parsed.differentiators, 3);

  const scoutIndustries = pickFromCatalog(parsed.scoutIndustries, SCOUT_INDUSTRIES, INDUSTRY_SET, 4);
  let scoutDepartments = pickFromCatalog(parsed.scoutDepartments, SCOUT_DEPARTMENTS, DEPARTMENT_SET, 3);
  let scoutSeniority = pickFromCatalog(parsed.scoutSeniority, SCOUT_SENIORITY, SENIORITY_SET, 3);

  if (!productSummary) {
    throw new Error("Website analysis could not determine what you sell. Add a product summary manually.");
  }

  const llmIntentRaw =
    parsed.platformIntent != null ? String(parsed.platformIntent).trim().toLowerCase().replace(/[\s-]+/g, "_") : "";
  const llmIntent: PlatformIntent | null =
    llmIntentRaw === "b2b_saas" ||
    llmIntentRaw === "corporate_gifting" ||
    llmIntentRaw === "appliances" ||
    llmIntentRaw === "general_b2b"
      ? llmIntentRaw
      : null;
  const inferredIntent = inferPlatformIntent({
    vertical,
    productSummary,
    buyerPersonas,
  });
  const platformIntent = params.platformIntent ?? llmIntent ?? inferredIntent;
  const productCategory = inferProductCategory({
    vertical,
    productSummary,
    llmCategory: parsed.productCategory != null ? String(parsed.productCategory) : undefined,
    platformIntent,
  });
  const intentDefaults = scoutDefaultsForIntent(platformIntent);
  const resolvedPersonas = buyerPersonas.length ? buyerPersonas : intentDefaults.buyerPersonas;
  if (!scoutDepartments.length) scoutDepartments = intentDefaults.scoutDepartments;
  if (!scoutSeniority.length) scoutSeniority = intentDefaults.scoutSeniority;

  const insights: WebsiteBrandInsights = {
    analyzedAt: new Date().toISOString(),
    brandName,
    vertical,
    productSummary,
    toneNotes:
      toneNotes ||
      "Friendly but professional. Plain and direct. Match the brand language from the website. Not salesy.",
    buyerPersonas: resolvedPersonas,
    valueProposition,
    differentiators,
    scoutIndustries,
    scoutDepartments,
    scoutSeniority,
    productCategory: productCategory ?? undefined,
    platformIntent,
    productWriteup: productWriteup || undefined,
    emailKeywords: emailKeywords.length ? emailKeywords : undefined,
  };

  const brandPatch: Partial<BrandConfig> = {
    brandSlug: "custom",
    brandName: brandName || params.orgName?.trim() || "Your Company",
    vertical: insights.vertical,
    productSummary: insights.productSummary,
    buyerPersonas: insights.buyerPersonas,
    toneNotes: insights.toneNotes,
    platformIntent,
    verticalPackId: verticalPackIdForIntent(platformIntent),
    websiteUrl,
    websiteInsights: insights,
  };

  return { websiteUrl, insights, brandPatch, platformIntent, productCategory };
}

/** Apply website analysis onto an existing BrandConfig (preserves preset slug if set). */
export function mergeWebsiteInsightsIntoBrand(
  existing: BrandConfig | undefined,
  result: AnalyzeSellerWebsiteResult,
  options?: { forceCustomSlug?: boolean; platformIntent?: PlatformIntent },
): BrandConfig {
  const inferred = inferPlatformIntent({
    vertical: result.insights.vertical,
    productSummary: result.insights.productSummary,
    buyerPersonas: result.insights.buyerPersonas,
  });
  const platformIntent =
    options?.platformIntent ??
    result.brandPatch.platformIntent ??
    // Prefer freshly inferred intent from this website over a stale workspace default
    (options?.forceCustomSlug ? inferred : existing?.platformIntent) ??
    existing?.platformIntent ??
    inferred;
  const verticalPackId = verticalPackIdForIntent(platformIntent);
  const baseSlug = options?.forceCustomSlug ? "custom" : existing?.brandSlug ?? "custom";

  if (baseSlug === "custom" || options?.forceCustomSlug) {
    return {
      brandSlug: "custom",
      brandName: result.brandPatch.brandName ?? existing?.brandName ?? "Your Company",
      vertical: result.brandPatch.vertical ?? "general",
      productSummary: result.brandPatch.productSummary ?? "",
      buyerPersonas: result.brandPatch.buyerPersonas ?? scoutDefaultsForIntent(platformIntent).buyerPersonas,
      toneNotes: result.brandPatch.toneNotes,
      platformIntent,
      verticalPackId,
      websiteUrl: result.websiteUrl,
      websiteInsights: result.insights,
    };
  }
  return {
    ...existing!,
    brandSlug: baseSlug,
    productSummary: result.insights.productSummary || existing!.productSummary,
    toneNotes: result.insights.toneNotes || existing!.toneNotes,
    buyerPersonas: result.insights.buyerPersonas.length
      ? result.insights.buyerPersonas
      : existing!.buyerPersonas,
    platformIntent,
    verticalPackId: existing!.verticalPackId ?? verticalPackId,
    websiteUrl: result.websiteUrl,
    websiteInsights: result.insights,
  };
}

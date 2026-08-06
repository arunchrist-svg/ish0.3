import { readFileSync } from "fs";
import { join } from "path";
import type { BrandSlug, CampaignMode } from "@/lib/email/config";

const cache = new Map<string, string>();

function loadFile(relativePath: string, fallback: string): string {
  const cached = cache.get(relativePath);
  if (cached) return cached;
  try {
    const content = readFileSync(join(process.cwd(), relativePath), "utf-8");
    cache.set(relativePath, content);
    return content;
  } catch {
    return fallback;
  }
}

export function loadGiftingRules(): string {
  return loadFile("src/knowledge/gifting_rules.md", getDefaultRules());
}

function loadBrandRules(brandSlug: BrandSlug): string {
  if (brandSlug === "custom") return "";
  return loadFile(`src/knowledge/brands/${brandSlug}.md`, "");
}

function loadCampaignRules(campaignMode: CampaignMode, brandSlug: BrandSlug): string {
  if (campaignMode === "custom" || campaignMode === "festival_bundle") return "";
  // Sweets-leaning Diwali campaign MD is ISH-only (tasting samples, hampers).
  if (campaignMode === "diwali_gifting" && brandSlug !== "ish") return "";
  return loadFile(`src/knowledge/campaigns/${campaignMode}.md`, "");
}

export function retrieveRelevantRules(context: {
  industry?: string;
  city?: string;
  season?: string;
  brandSlug?: BrandSlug;
  campaignMode?: CampaignMode;
  productSummary?: string;
  campaignNotes?: string;
  websiteInsights?: {
    valueProposition?: string;
    differentiators?: string[];
    toneNotes?: string;
  };
}): string {
  const sections: string[] = [];
  const brandSlug = context.brandSlug ?? "custom";
  const campaignMode = context.campaignMode ?? "diwali_gifting";

  const brand = loadBrandRules(brandSlug);
  if (brand) sections.push(brand);

  const campaign = loadCampaignRules(campaignMode, brandSlug);
  if (campaign) sections.push(campaign);

  if (context.productSummary?.trim()) {
    sections.push(`## Company product catalog\n${context.productSummary.trim()}`);
  }

  if (context.websiteInsights?.valueProposition?.trim()) {
    sections.push(`## Value proposition\n${context.websiteInsights.valueProposition.trim()}`);
  }

  if (context.websiteInsights?.differentiators?.length) {
    sections.push(
      `## Differentiators\n${context.websiteInsights.differentiators.map((d) => `- ${d}`).join("\n")}`,
    );
  }

  if (context.websiteInsights?.toneNotes?.trim()) {
    sections.push(`## Website-derived writing style\n${context.websiteInsights.toneNotes.trim()}`);
  }

  if (context.campaignNotes?.trim()) {
    sections.push(`## Campaign notes\n${context.campaignNotes.trim()}`);
  }

  // Legacy ISH gifting rules contain mithai/pure-ghee copy. Never inject for other brands.
  if (brandSlug === "ish") {
    const legacy = filterLegacyRules(loadGiftingRules(), context);
    if (legacy) sections.push(legacy);
  }

  return sections.join("\n\n").slice(0, 6000) || getDefaultRules();
}

function filterLegacyRules(all: string, context: { industry?: string; city?: string; season?: string }): string {
  const lines = all.split("\n");
  const relevant: string[] = [];
  let inRelevantSection = false;

  const keywords = [
    context.industry?.toLowerCase(),
    context.city?.toLowerCase(),
    context.season?.toLowerCase() ?? "diwali",
    "tone", "compliance", "cta",
  ].filter(Boolean) as string[];

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (line.startsWith("#")) {
      inRelevantSection = keywords.some((k) => lower.includes(k));
    }
    if (inRelevantSection || keywords.some((k) => lower.includes(k))) {
      relevant.push(line);
    }
  }

  return relevant.slice(0, 40).join("\n");
}

function getDefaultRules(): string {
  return `# Outreach Rules

## Tone (Primary inbox)
- Open with "Hi {firstName}," — never "Dear"
- Sign with the sender's real first name — not a team name
- Max 120 words, one question CTA
- Subject: short, conversational, no brand suffix

## Compliance
- Personalise every email
- Do not mention competitor brands
`;
}

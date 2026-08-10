import { readFileSync } from "fs";
import { join } from "path";
import type { BrandConfig, CampaignMode } from "@/lib/email/config";
import { getVerticalPack, resolveVerticalPackId, type VerticalPackId } from "@/vertical-packs";

const cache = new Map<string, string>();

function loadFile(relativePath: string, fallback = ""): string {
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

function loadPackKnowledge(packId: VerticalPackId): string {
  const pack = getVerticalPack(packId);
  if (!pack.knowledgeFiles.length) return "";
  return pack.knowledgeFiles
    .map((rel) => loadFile(`src/vertical-packs/${pack.id}/${rel}`))
    .filter(Boolean)
    .join("\n\n");
}

/** @deprecated Prefer retrieveRelevantRules with brandConfig.verticalPackId */
export function loadGiftingRules(): string {
  return loadPackKnowledge("gifting-sweets") || getDefaultRules();
}

export function retrieveRelevantRules(context: {
  industry?: string;
  city?: string;
  season?: string;
  brandSlug?: BrandConfig["brandSlug"];
  verticalPackId?: VerticalPackId | string;
  campaignMode?: CampaignMode;
  productSummary?: string;
  campaignNotes?: string;
  websiteInsights?: {
    valueProposition?: string;
    differentiators?: string[];
    toneNotes?: string;
    productWriteup?: string;
    emailKeywords?: string[];
  };
}): string {
  const sections: string[] = [];
  const packId = resolveVerticalPackId(context.verticalPackId, context.brandSlug);

  const packKnowledge = loadPackKnowledge(packId);
  if (packKnowledge) {
    sections.push(filterPackKnowledge(packKnowledge, context));
  }

  if (context.websiteInsights?.productWriteup?.trim()) {
    sections.push(`## Product writeup\n${context.websiteInsights.productWriteup.trim()}`);
  }

  if (context.websiteInsights?.emailKeywords?.length) {
    sections.push(
      `## Email focus keywords\nUse 1-2 of these themes. Never stuff all of them:\n${context.websiteInsights.emailKeywords.map((k) => `- ${k}`).join("\n")}`,
    );
  }

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

  return sections.join("\n\n").slice(0, 6000) || getDefaultRules();
}

function filterPackKnowledge(
  all: string,
  context: { industry?: string; city?: string; season?: string; campaignMode?: CampaignMode },
): string {
  const lines = all.split("\n");
  const relevant: string[] = [];
  let inRelevantSection = false;

  const keywords = [
    context.industry?.toLowerCase(),
    context.city?.toLowerCase(),
    context.season?.toLowerCase(),
    context.campaignMode?.toLowerCase(),
    "tone",
    "compliance",
    "cta",
  ].filter(Boolean) as string[];

  if (!keywords.length) return all.slice(0, 4000);

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (line.startsWith("#")) {
      inRelevantSection = keywords.some((k) => lower.includes(k));
    }
    if (inRelevantSection || keywords.some((k) => lower.includes(k))) {
      relevant.push(line);
    }
  }

  return (relevant.length ? relevant : lines).slice(0, 80).join("\n");
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

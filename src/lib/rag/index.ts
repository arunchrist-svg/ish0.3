import { readFileSync } from "fs";
import { join } from "path";

let cachedRules: string | null = null;

export function loadGiftingRules(): string {
  if (cachedRules) return cachedRules;
  try {
    const filePath = join(process.cwd(), "src/knowledge/gifting_rules.md");
    cachedRules = readFileSync(filePath, "utf-8");
    return cachedRules;
  } catch {
    return getDefaultRules();
  }
}

export function retrieveRelevantRules(context: { industry?: string; city?: string; season?: string }): string {
  const all = loadGiftingRules();
  const lines = all.split("\n");
  const relevant: string[] = [];
  let inRelevantSection = false;

  const keywords = [
    context.industry?.toLowerCase(),
    context.city?.toLowerCase(),
    context.season?.toLowerCase() ?? "diwali",
    "corporate", "gifting", "mithai", "sweet",
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

  return relevant.slice(0, 80).join("\n") || all.slice(0, 2000);
}

function getDefaultRules(): string {
  return `# ISH Gifting Rules

## Core offering
India Sweet House offers premium pure-ghee mithai, dry fruit hampers, and curated gift boxes for corporate gifting.
Pricing: ₹500–₹2,000 per person for bulk orders of 100+ employees.

## Diwali campaign guidelines
- Lead time: 3–4 weeks before Diwali
- Minimum order: 50 boxes
- Customisation: Company name/logo on box lid
- Delivery: Pan-India for orders > 500 units
- Shelf life: 15 days for mithai; 3 months for dry fruit

## Compliance
- No spam. Personalise every email.
- Include unsubscribe line at footer.
- Do not mention competitor brands.

## Tone guidelines
- Professional, warm, and concise
- Subject line: 6–8 words, personalised with company/contact name
- Body: 3 short paragraphs maximum
- Always end with a clear CTA: "Can we schedule a 15-min call?"
`;
}

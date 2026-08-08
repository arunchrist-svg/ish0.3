import type { BrandConfig } from "@/lib/email/config";
import { getVerticalPack, resolveVerticalPackId } from "@/vertical-packs";

export const BASE_WRITER_TONE = `WRITER TONE (all brands):
- Friendly but professional. Write like a thoughtful colleague who did their homework.
- Plain and direct. No hype, no flattery, no people-pleasing.
- Not salesy: avoid excited to, would love to, amazing, thrilled, touch base, reach out, pick your brain, game-changer, best-in-class.
- Not fluffy: avoid Hope you are well, Hope this finds you, I wanted to reach out.
- Not pleasing: no over-apologizing, no excessive thank-yous, no begging for time.
- Confident and helpful without being pushy. Short sentences. One idea at a time.
- Never cite numeric company stats (employee count, headcount, revenue). Say your team instead.`;

export function getWriterTonePersona(brandConfig: BrandConfig): string {
  const pack = getVerticalPack(
    resolveVerticalPackId(brandConfig.verticalPackId, brandConfig.brandSlug),
  );
  const verticalHint = pack.toneHint;
  const brandBlock = [
    `BRAND VOICE (${brandConfig.brandName}):`,
    `- Vertical: ${brandConfig.vertical.replace(/_/g, " ")}`,
    `- ${verticalHint}`,
    brandConfig.toneNotes ? `- Writing style: ${brandConfig.toneNotes}` : null,
    brandConfig.buyerPersonas?.length
      ? `- Typical buyers: ${brandConfig.buyerPersonas.slice(0, 3).join(", ")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  return `${BASE_WRITER_TONE}\n\n${brandBlock}`;
}

export function getWriterFewShotExample(
  _brandSlug: BrandConfig["brandSlug"] | string,
  brandName: string,
  senderFirstName: string,
  contactFirstName = "Priya",
  companyName = "TechCorp",
  productSummary = "",
  verticalPackId?: BrandConfig["verticalPackId"],
): string {
  const productLine = productSummary.trim()
    ? productSummary.trim().replace(/\.\s*$/, "")
    : `we help teams with solutions from ${brandName}`;

  const packId = resolveVerticalPackId(verticalPackId, _brandSlug as BrandConfig["brandSlug"]);
  const subjectHint =
    packId === "gifting-sweets"
      ? `Options for ${companyName}`
      : packId === "gifting-appliances"
        ? `Employee rewards for ${companyName}`
        : `Partnership with ${companyName}`;

  return `
---
GOOD EXAMPLE (follow this pattern):
Subject A: ${subjectHint}
Subject B: ${contactFirstName}, ${companyName} team
Body:
Hi ${contactFirstName},

${companyName}'s team priorities came up in our research. At ${brandName}, ${productLine}.

Open to a quick note on a few options that fit your team?

No worries if the timing is off.

${senderFirstName}
Partnerships, ${brandName}

---
`;
}

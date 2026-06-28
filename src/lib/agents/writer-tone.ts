import type { BrandConfig, BrandSlug } from "@/lib/email/config";

export const BASE_WRITER_TONE = `WRITER TONE (all brands):
- Friendly but professional. Write like a thoughtful colleague who did their homework.
- Plain and direct. No hype, no flattery, no people-pleasing.
- Not salesy: avoid excited to, would love to, amazing, thrilled, touch base, reach out, pick your brain, game-changer, best-in-class.
- Not fluffy: avoid Hope you are well, Hope this finds you, I wanted to reach out.
- Not pleasing: no over-apologizing, no excessive thank-yous, no begging for time.
- Confident and helpful without being pushy. Short sentences. One idea at a time.`;

const VERTICAL_HINTS: Record<string, string> = {
  sweets_gifting: "Product angle: mithai, hampers, Diwali gifting, tasting samples. Festive but plain language.",
  appliances: "Product angle: kitchen appliances, employee rewards, warranty, bulk pricing. Practical, not flashy.",
  general: "Product angle: use the product summary below. Stay factual, not promotional.",
};

export function getWriterTonePersona(brandConfig: BrandConfig): string {
  const verticalHint = VERTICAL_HINTS[brandConfig.vertical] ?? VERTICAL_HINTS.general;
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
  brandSlug: BrandSlug,
  brandName: string,
  senderFirstName: string,
  contactFirstName = "Priya",
  companyName = "TechCorp",
): string {
  if (brandSlug === "prestige") {
    return `
---
GOOD EXAMPLE (follow this pattern):
Subject A: Employee rewards for ${companyName}
Subject B: ${contactFirstName}, ${companyName} appliance bundles
Body:
Hi ${contactFirstName},

${companyName}'s team rewards program came up in our research. We supply mixer grinders and kitchen bundles for corporate gifting at volume pricing, with pan-India warranty support.

Open to a quick note on two bundle formats that fit HR budgets?

No worries if the timing is off.

${senderFirstName}
Partnerships, ${brandName}

---
`;
  }

  return `
---
GOOD EXAMPLE (follow this pattern):
Subject A: Diwali hampers for ${companyName}
Subject B: ${contactFirstName}, ${companyName} campus gifting
Body:
Hi ${contactFirstName},

${companyName} has been growing its Bangalore tech campus. With Diwali a few weeks out, we have been curating mithai and dry-fruit hampers for IT teams in the city.

Open to a quick note on a few options?

No worries if the timing is off.

${senderFirstName}
Partnerships, ${brandName}

---
`;
}

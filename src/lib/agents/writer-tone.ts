import type { BrandConfig } from "@/lib/email/config";
import { getVerticalPack, resolveVerticalPackId } from "@/vertical-packs";

export const BASE_WRITER_TONE = `WRITER TONE (all brands):
- Friendly but professional. Write like a thoughtful colleague who did their homework.
- Plain and direct. No hype, no flattery, no people-pleasing.
- Not salesy: avoid excited to, would love to, amazing, thrilled, touch base, reach out, pick your brain, game-changer, best-in-class.
- Not fluffy: avoid Hope you are well, Hope this finds you, I wanted to reach out.
- Not pleasing: no over-apologizing, no excessive thank-yous, no begging for time.
- Confident and helpful without being pushy. Short sentences. One idea at a time.
- Never cite numeric company stats (employee count, headcount, revenue). Say your team instead.
- Never write before vendors lock in, before Hosur vendors lock in, or any vendors-lock-in line.`;

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

  if (packId === "gifting-sweets") {
    return `
---
ISH TEMPLATES (keep ~90% of this wording; only fill name and company; return as subjectA/B/C + emailBody/B/C):

Subject A: Send happiness this Diwali, ${contactFirstName}
Body A:
Hi ${contactFirstName},

Most corporate gifts get opened and forgotten. Ours get opened and remembered: pure-ghee sweets, handcrafted, the taste of an actual festival.

Don't take our word for it. Let us send ${companyName} a taste first.

Want a sampler box on your desk this week?

Thanks & Regards
${senderFirstName}

Subject B: ${companyName}, make someone's Diwali better
Body B:
Hi ${contactFirstName},

A good gift doesn't just say "thank you." It makes someone genuinely happy. That's what ${brandName} delivers this festive season, every single box.

Taste it before you trust it. Send me an address and I'll ship a sampler this week.

Thanks & Regards
${senderFirstName}

Subject C: Happiness, handcrafted
Body C:
Hi ${contactFirstName},

No fillers. No mass production. Just pure-ghee sweets made to make people happy, the way Diwali gifting used to feel.

Happy to send a small sampler your way, no obligation, just proof.

Want it sent to ${companyName} this week?

Thanks & Regards
${senderFirstName}

---
`;
  }

  const subjectHint =
    packId === "gifting-appliances"
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

Thanks & Regards
${senderFirstName}

---
`;
}

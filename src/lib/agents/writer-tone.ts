import type { BrandConfig } from "@/lib/email/config";
import { getVerticalPack, resolveVerticalPackId } from "@/vertical-packs";
import { fillIshDraftVariants } from "@/lib/email/ish-cold-templates";
import { isFestiveWriteOccasion, type WriteOccasionId } from "@/lib/occasions/catalog";

export const BASE_WRITER_TONE = `WRITER TONE (all brands):
- Friendly but professional. Write like a thoughtful colleague who did their homework.
- Plain and direct. No hype, no flattery, no people-pleasing.
- Not salesy: avoid excited to, would love to, amazing, thrilled, complimentary, touch base, reach out, pick your brain, game-changer, best-in-class.
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
  occasionId?: WriteOccasionId | null,
): string {
  const productLine = productSummary.trim()
    ? productSummary.trim().replace(/\.\s*$/, "")
    : `we help teams with solutions from ${brandName}`;

  const packId = resolveVerticalPackId(verticalPackId, _brandSlug as BrandConfig["brandSlug"]);

  if (packId === "gifting-sweets" && occasionId && !isFestiveWriteOccasion(occasionId)) {
    const copy = fillIshDraftVariants({
      contactFirstName,
      companyName,
      senderFirstName,
      brandName,
      sequencePosition: 1,
      occasionId,
    });
    return `
---
ISH TEMPLATES (keep ~90% of this wording; only fill name and company; return as subjectA/B/C + emailBody/B/C):

Subject A: ${copy.subjectA}
Body A:
${copy.emailBody}

Subject B: ${copy.subjectB}
Body B:
${copy.emailBodyB}

Subject C: ${copy.subjectC}
Body C:
${copy.emailBodyC}

---
`;
  }

  if (packId === "gifting-sweets") {
    return `
---
ISH TEMPLATES (keep ~90% of this wording; only fill name and company; return as subjectA/B/C + emailBody/B/C):

Subject A: Sample box for festive tasting, ${contactFirstName}
Body A:
Hi ${contactFirstName},

Most corporate festival gifts are forgotten by the next day. We wanted to offer something memorable and distinctive for the team at ${companyName} this year.

At ${brandName}, traditional sweets are crafted fresh every morning with organic milk, ghee, and khova from our own farm. We never add preservatives or chemicals.

Since tasting is believing, I would love to send a sample box to ${companyName} as our treat. What is the best delivery address to ship it to?

Best,
${senderFirstName}
${brandName}

Subject B: Festive sweets sample for ${companyName}
Body B:
Hi ${contactFirstName},

A good Diwali gift for employees and clients should feel authentic. ${brandName} can bring that to ${companyName}: sweets crafted fresh every morning, using organic milk from our own farm. We never add preservatives or chemicals.

Taste it before you trust it. Send me an address and I'll ship a sampler to ${companyName} this week.

Thanks & Regards
${senderFirstName}
${brandName}

Subject C: A tasting box for your team
Body C:
Hi ${contactFirstName},

For Diwali gifting to employees and clients at ${companyName}, ${brandName} can bring farm-fresh mithai: organic milk from our own farm, and we never add preservatives or chemicals. Production is highly hygienic.

Happy to send a small sampler your way, no obligation, just proof.

Want it sent to ${companyName} this week?

Thanks & Regards
${senderFirstName}
${brandName}

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
${brandName}

---
`;
}

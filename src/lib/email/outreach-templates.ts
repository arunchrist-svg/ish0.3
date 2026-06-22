export const OUTREACH_TEMPLATES = [
  {
    id: "gift_sampling",
    label: "Sending a Gift Sampling",
    shortLabel: "Gift Sampling",
    description: "Offer a complimentary tasting box to their desk or office",
    ctaInstruction:
      "Primary CTA: offer to send a complimentary ISH Diwali tasting sample to their desk. Ask for delivery address and approximate team size.",
  },
  {
    id: "meet_online",
    label: "Meet online to present",
    shortLabel: "Meet Online",
    description: "Book a short video call to showcase the gift range",
    ctaInstruction:
      "Primary CTA: invite them to a 15-min online presentation of our Diwali gifting range via Google Meet or Teams.",
  },
  {
    id: "meet_in_person",
    label: "Meet in person to present sweets samples",
    shortLabel: "Meet In Person",
    description: "Schedule an in-person tasting session at their office",
    ctaInstruction:
      "Primary CTA: propose a 15-min in-person visit to present sweet samples and hampers at their office.",
  },
] as const;

export type OutreachTemplateId = (typeof OUTREACH_TEMPLATES)[number]["id"];

export function getOutreachTemplate(id?: string) {
  return OUTREACH_TEMPLATES.find((t) => t.id === id) ?? OUTREACH_TEMPLATES[0];
}

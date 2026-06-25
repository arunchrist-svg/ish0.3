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
  {
    id: "follow_up",
    label: "Follow-up Reminder",
    shortLabel: "Follow-up",
    description: "Brief, warm check-in referencing the first email",
    ctaInstruction:
      "This is a brief follow-up. Reference that you reached out before. Ask if they had a chance to see the earlier note. Offer a sample or quick 10-minute call. Keep it under 80 words.",
  },
  {
    id: "final_reminder",
    label: "Final Reminder",
    shortLabel: "Final",
    description: "Last respectful note — no pressure, leave the door open",
    ctaInstruction:
      "This is the final note in the sequence. Be warm and respectful. Say this is your last email so you don't clutter their inbox. Leave the door open for when the time is right. No pressure. Under 70 words.",
  },
] as const;

export type OutreachTemplateId = (typeof OUTREACH_TEMPLATES)[number]["id"];

export function getOutreachTemplate(id?: string) {
  return OUTREACH_TEMPLATES.find((t) => t.id === id) ?? OUTREACH_TEMPLATES[0];
}

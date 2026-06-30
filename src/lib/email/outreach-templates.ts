export const OUTREACH_TEMPLATES = [
  {
    id: "gift_sampling",
    label: "Sending a Gift Sampling",
    shortLabel: "Gift Sampling",
    description: "Offer a complimentary tasting box to their desk or office",
    ctaInstruction:
      "Primary CTA: offer a complimentary Diwali tasting sample. Ask if they are open to receiving one. Do NOT ask for address, phone, or team size in email #1; offer to coordinate details after they reply.",
  },
  {
    id: "meet_online",
    label: "Meet online to present",
    shortLabel: "Meet Online",
    description: "Book a short video call to showcase the gift range",
    ctaInstruction:
      "Primary CTA: invite them to a 15-min online presentation of our Diwali gifting range. Ask if a brief call this week works. No harvesting of personal info.",
  },
  {
    id: "meet_in_person",
    label: "Meet in person to present sweets samples",
    shortLabel: "Meet In Person",
    description: "Schedule an in-person tasting session at their office",
    ctaInstruction:
      "Primary CTA: propose a 15-min in-person visit to present samples. Ask if they are open to a short visit. Do not ask for address or headcount in email #1.",
  },
  {
    id: "follow_up",
    label: "Follow-up Reminder",
    shortLabel: "Follow-up",
    description: "Second email with new value, not a generic check-in",
    ctaInstruction:
      "Email 2 of 3. Do NOT say 'just following up' or 'checking in'. Add ONE new value angle not in Email 1: a proof point, case study, seasonal deadline, or new detail from company intel. One soft CTA. Max 3 sentences in the pitch body.",
  },
  {
    id: "final_reminder",
    label: "Final Reminder",
    shortLabel: "Final",
    description: "Last respectful note. No pressure, leave the door open",
    ctaInstruction:
      "This is the final note in the sequence. Be warm and respectful. Say this is your last email so you don't clutter their inbox. Leave the door open for when the time is right. No pressure. Under 70 words.",
  },
] as const;

export type OutreachTemplateId = (typeof OUTREACH_TEMPLATES)[number]["id"];

export const REPLY_SEQUENCE_POSITION = 4;

export type ReplyIntentType = "affirmative" | "negative" | "question" | "scheduling" | "other";

export function getOutreachTemplate(id?: string) {
  return OUTREACH_TEMPLATES.find((t) => t.id === id) ?? OUTREACH_TEMPLATES[0];
}

/** Post-reply CTA instructions keyed off the original outreach template and reply intent. */
export function getReplyCtaInstruction(
  baseTemplateId: string | null | undefined,
  intent: ReplyIntentType,
): string {
  if (intent === "negative") {
    return "They declined or are not interested. Be gracious, thank them, and leave the door open. No hard sell or repeated offers.";
  }

  if (intent === "question") {
    return "Answer their question briefly and specifically. End with one soft follow-up question to keep momentum.";
  }

  if (intent === "scheduling") {
    return "They proposed a time or asked about scheduling. Confirm or offer 2-3 specific slots. Keep it short.";
  }

  switch (baseTemplateId) {
    case "gift_sampling":
      if (intent === "affirmative") {
        return "They agreed to the tasting sample. Thank them briefly. Ask for office/delivery address and a contact phone for the courier. Do NOT re-ask if they want a sample.";
      }
      return "Move toward confirming the tasting sample delivery. Ask for address and phone if not yet provided.";

    case "meet_online":
      if (intent === "affirmative") {
        return "They agreed to a call. Thank them briefly. Ask for 2-3 time slots this week or if they prefer a calendar link.";
      }
      return "Move toward booking the online presentation. Ask for availability if not yet provided.";

    case "meet_in_person":
      if (intent === "affirmative") {
        return "They agreed to an in-person visit. Thank them briefly. Ask for office address and a preferred day/time.";
      }
      return "Move toward scheduling the in-person visit. Ask for address and preferred timing if not yet provided.";

    default:
      return "Thank them for replying. Ask for the one detail needed to move forward. Do NOT repeat a question they already answered affirmatively.";
  }
}

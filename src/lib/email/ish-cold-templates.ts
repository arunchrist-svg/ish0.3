import { companyNameForEmail } from "@/lib/email/company-display-name";
import { getIshOccasionEmails } from "@/lib/email/ish-occasion-templates";
import { isFestiveWriteOccasion, type WriteOccasionId } from "@/lib/occasions/catalog";

/** India Sweet House sequences from ISH_Cold_Email_Templates.md. Fill name/company only. */

export type IshFillParams = {
  contactFirstName: string;
  companyName: string;
  senderFirstName: string;
  brandName: string;
  sequencePosition: number;
  templateId?: string | null;
  occasionId?: WriteOccasionId | null;
  occasionTiming?: "upcoming" | "recent";
};

type IshEmail = { subject: string; body: string };

function signOff(sender: string, brand: string, style: "thanks" | "best" = "thanks"): string {
  const name = sender.trim() || "Srilaksha";
  if (style === "best") return `Best,\n${name}\n${brand}`;
  return `Thanks & Regards\n${name}\n${brand}`;
}

function applyCta(paragraphs: string, templateId?: string | null): string {
  const tastingCta =
    /Since tasting is believing, I would love to send a sample box to your office as our treat\. What is the best delivery address to ship it to\?/;
  if (templateId === "meet_online") {
    if (tastingCta.test(paragraphs)) {
      return paragraphs.replace(tastingCta, "Open to a 15-minute online walkthrough this week?");
    }
    if (/\n[^\n]+\?\s*$/.test(paragraphs)) {
      return paragraphs.replace(/\n[^\n]+\?\s*$/, "\nOpen to a 15-minute online walkthrough this week?");
    }
    return `${paragraphs}\n\nOpen to a 15-minute online walkthrough this week?`;
  }
  if (templateId === "meet_in_person") {
    if (tastingCta.test(paragraphs)) {
      return paragraphs.replace(tastingCta, "Open to a brief in-person tasting at your office?");
    }
    if (/\n[^\n]+\?\s*$/.test(paragraphs)) {
      return paragraphs.replace(/\n[^\n]+\?\s*$/, "\nOpen to a brief in-person tasting at your office?");
    }
    return `${paragraphs}\n\nOpen to a brief in-person tasting at your office?`;
  }
  return paragraphs;
}

function wrap(
  first: string,
  sender: string,
  brand: string,
  paragraphs: string,
  closing: "thanks" | "best" = "thanks",
): string {
  return `Hi ${first},\n\n${paragraphs}\n\n${signOff(sender, brand, closing)}`;
}

/** Sequences 1, 2, 3 from the ISH cold-email file. */
export function getIshSequenceEmails(params: IshFillParams): IshEmail[] {
  const first = params.contactFirstName || "there";
  const company = companyNameForEmail(params.companyName);
  const sender = params.senderFirstName?.trim() || "Srilaksha";
  const brand = params.brandName?.trim() || "India Sweet House";
  const step = params.sequencePosition >= 3 ? 3 : params.sequencePosition === 2 ? 2 : 1;
  const cta = step === 1 ? params.templateId : undefined;

  const sequences: Array<Array<{ subject: string; paragraphs: string }>> = [
    [
      {
        subject: `Sample box for festive tasting, ${first}`,
        paragraphs: `Most corporate festival gifts are forgotten by the next day. We wanted to offer something memorable and distinctive for your team this year.\n\nAt ${brand}, we handcraft traditional sweets straight from our own farm to the box with zero compromises. There are no artificial flavors and no preservatives. Just fresh milk, 100% pure ghee, and uncompromised quality you can taste in every bite.\n\nSince tasting is believing, I would love to send a sample box to your office as our treat. What is the best delivery address to ship it to?`,
      },
      {
        subject: `Re: Sample box for festive tasting, ${first}`,
        paragraphs: `What sets ${brand} apart for Diwali is the farm-to-counter pipeline: organic milk from our own dairy, mithai prepared fresh daily with zero preservatives, and hygiene standards strong enough for exports to the USA and Australia.\n\nThat purity is what teams and clients taste in every box.\n\nHappy to send ${company} a small tasting box so you can judge for yourself. Shall I ship one this week?`,
      },
      {
        subject: `Re: Sample box for festive tasting, ${first}`,
        paragraphs: `I don't want to keep filling your inbox, so I'll leave it here. If ${company}'s festive gifting comes up later this season, ${brand} would be glad to help with farm-to-counter mithai made from our own organic dairy.\n\nI won't email further, but a tasting box stays open if you ever want to reach out.\n\nWishing you a great Diwali either way.`,
      },
    ],
    [
      {
        subject: `Festive sweets sample for ${company}`,
        paragraphs: `A good Diwali gift for employees and clients should feel authentic. ${brand} can bring that to ${company}: sweets made fresh each day with zero preservatives, using organic milk from our own dairy rather than outsourced supply.\n\nTaste it before you trust it. Send me an address and I'll ship a sampler this week.`,
      },
      {
        subject: `Re: Festive sweets sample for ${company}`,
        paragraphs: `${brand} is known for premium mithai with real range: more than 200 traditional sweets and namkeens, plus diet-conscious picks like Jaggery Kaju Katli and Sugarfree Honey Laddu, all rooted in our own organic dairy.\n\nIf ${company} wants Diwali gifting that feels thoughtful and premium, a tasting box shows it fastest.\n\nWhere should I send one?`,
      },
      {
        subject: `Re: Festive sweets sample for ${company}`,
        paragraphs: `I'll stop following up after this one. If a tasting box or gifting quote is useful later, ${brand} is here with fresh daily mithai, zero preservatives, and authentic Diwali sweetness.\n\nI won't email further, but the door stays open. Wishing ${company} a happy Diwali.`,
      },
    ],
    [
      {
        subject: "A tasting box for your team",
        paragraphs: `No fillers. No mass production. For Diwali gifting to employees and clients, ${brand} can bring farm-to-counter mithai: organic milk from our dairy, zero preservatives, and manufacturing hygiene trusted for global export.\n\nHappy to send a small sampler your way, no obligation, just proof.\n\nWant it sent to ${company} this week?`,
      },
      {
        subject: "Re: A tasting box for your team",
        paragraphs: `For Diwali, authenticity sells. ${brand} sources organic milk from its own dairy farm, prepares mithai fresh daily without chemical preservatives, and holds export-grade hygiene for markets like the USA and Australia.\n\nThat is why the taste holds up in a corporate gift box.\n\nShould I send ${company} a tasting box?`,
      },
      {
        subject: "Re: A tasting box for your team",
        paragraphs: `I'll leave it here so I'm not cluttering your inbox further. If festive gifting for ${company} comes up this season, ${brand} can help with export-grade hygiene and organic milk from our own dairy.\n\nI won't email further, but feel free to reach out anytime. Happy Diwali in advance.`,
      },
    ],
  ];

  return sequences.map((seq, i) => {
    const email = seq[step - 1];
    const closing = step === 1 && i === 0 ? "best" : "thanks";
    return {
      subject: email.subject,
      body: wrap(first, sender, brand, applyCta(email.paragraphs, cta), closing),
    };
  });
}

export function fillIshDraftVariants(params: IshFillParams) {
  if (params.occasionId && !isFestiveWriteOccasion(params.occasionId)) {
    const [a, b, c] = getIshOccasionEmails({
      ...params,
      occasionId: params.occasionId,
    });
    return {
      subjectA: a.subject,
      subjectB: b.subject,
      subjectC: c.subject,
      emailBody: a.body,
      emailBodyB: b.body,
      emailBodyC: c.body,
    };
  }
  const [a, b, c] = getIshSequenceEmails(params);
  return {
    subjectA: a.subject,
    subjectB: b.subject,
    subjectC: c.subject,
    emailBody: a.body,
    emailBodyB: b.body,
    emailBodyC: c.body,
  };
}

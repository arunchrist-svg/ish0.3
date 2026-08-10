/** India Sweet House sequences from ISH_Cold_Email_Templates.md. Fill name/company only. */

export type IshFillParams = {
  contactFirstName: string;
  companyName: string;
  senderFirstName: string;
  brandName: string;
  sequencePosition: number;
  templateId?: string | null;
};

type IshEmail = { subject: string; body: string };

function signOff(sender: string): string {
  return `Thanks & Regards\n${sender}`;
}

function applyCta(paragraphs: string, templateId?: string | null): string {
  if (templateId === "meet_online") {
    if (/\n[^\n]+\?\s*$/.test(paragraphs)) {
      return paragraphs.replace(/\n[^\n]+\?\s*$/, "\nOpen to a 15-minute online walkthrough this week?");
    }
    return `${paragraphs}\n\nOpen to a 15-minute online walkthrough this week?`;
  }
  if (templateId === "meet_in_person") {
    if (/\n[^\n]+\?\s*$/.test(paragraphs)) {
      return paragraphs.replace(/\n[^\n]+\?\s*$/, "\nOpen to a brief in-person tasting at your office?");
    }
    return `${paragraphs}\n\nOpen to a brief in-person tasting at your office?`;
  }
  return paragraphs;
}

function wrap(first: string, sender: string, paragraphs: string): string {
  return `Hi ${first},\n\n${paragraphs}\n\n${signOff(sender)}`;
}

/** Sequences 1, 2, 3 from the ISH cold-email file. */
export function getIshSequenceEmails(params: IshFillParams): IshEmail[] {
  const first = params.contactFirstName || "there";
  const company = params.companyName?.trim() || "your team";
  const sender = params.senderFirstName;
  const brand = params.brandName;
  const step = params.sequencePosition >= 3 ? 3 : params.sequencePosition === 2 ? 2 : 1;
  const cta = step === 1 ? params.templateId : undefined;

  const sequences: Array<Array<{ subject: string; paragraphs: string }>> = [
    [
      {
        subject: `Send happiness this Diwali, ${first}`,
        paragraphs: `Most corporate gifts get opened and forgotten. Ours get opened and remembered: pure-ghee sweets, handcrafted, the taste of an actual festival.\n\nDon't take our word for it. Let us send ${company} a taste first.\n\nWant a sampler box on your desk this week?`,
      },
      {
        subject: `Re: Send happiness this Diwali, ${first}`,
        paragraphs: `Following up on my note below. Diwali gifting always sneaks up faster than expected, and our tasting slots are filling up.\n\nShould I go ahead and ship a free sampler to ${company}, no strings attached?`,
      },
      {
        subject: `Re: Send happiness this Diwali, ${first}`,
        paragraphs: `I don't want to keep filling your inbox, so I'll leave it here. If ${company}'s festive gifting comes up later this season, we'd love to be considered.\n\nI won't email further, but the offer for a free tasting box stays open if you ever want to reach out.\n\nWishing you a great Diwali either way.`,
      },
    ],
    [
      {
        subject: `${company}, make someone's Diwali better`,
        paragraphs: `A good gift doesn't just say "thank you." It makes someone genuinely happy. That's what ${brand} delivers this festive season, every single box.\n\nTaste it before you trust it. Send me an address and I'll ship a sampler this week.`,
      },
      {
        subject: `Re: ${company}, make someone's Diwali better`,
        paragraphs: `Just circling back. Happy to send that free sampler over so ${company} can taste it firsthand before deciding anything.\n\nWhere should I have it delivered?`,
      },
      {
        subject: `Re: ${company}, make someone's Diwali better`,
        paragraphs: `I'll stop following up after this one. If a tasting box or a gifting quote is useful down the line, just reply and I'll get it moving.\n\nI won't email further, but the door stays open. Wishing ${company} a happy Diwali.`,
      },
    ],
    [
      {
        subject: "Happiness, handcrafted",
        paragraphs: `No fillers. No mass production. Just pure-ghee sweets made to make people happy, the way Diwali gifting used to feel.\n\nHappy to send a small sampler your way, no obligation, just proof.\n\nWant it sent to ${company} this week?`,
      },
      {
        subject: "Re: Happiness, handcrafted",
        paragraphs: `Wanted to check back in. The sampler offer is still open, no cost, no commitment, just a chance to taste what we make before Diwali orders lock in.\n\nShould I send one to ${company}?`,
      },
      {
        subject: "Re: Happiness, handcrafted",
        paragraphs: `I'll leave it here so I'm not cluttering your inbox further. If festive gifting for ${company} comes up this season, we'd be glad to help.\n\nI won't email further, but feel free to reach out anytime. Happy Diwali in advance.`,
      },
    ],
  ];

  return sequences.map((seq) => {
    const email = seq[step - 1];
    return {
      subject: email.subject,
      body: wrap(first, sender, applyCta(email.paragraphs, cta)),
    };
  });
}

export function fillIshDraftVariants(params: IshFillParams) {
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

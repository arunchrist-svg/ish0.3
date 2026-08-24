import { companyNameForEmail } from "@/lib/email/company-display-name";
import { getIshOccasionEmails } from "@/lib/email/ish-occasion-templates";
import { isFestiveWriteOccasion, type WriteOccasionId } from "@/lib/occasions/catalog";

/** India Sweet House sequences from ISH_Cold_Email_Templates.md. Fill name/company only. */

export type IshFillParams = {
  contactFirstName: string;
  companyName: string;
  /** Full From name from Email settings. */
  senderFirstName: string;
  brandName: string;
  sequencePosition: number;
  templateId?: string | null;
  occasionId?: WriteOccasionId | null;
  occasionTiming?: "upcoming" | "recent";
  /** Optional From phone from Email settings. */
  senderPhone?: string | null;
  fromAddress?: string | null;
};

type IshEmail = { subject: string; body: string };

function signOff(
  sender: string,
  brand: string,
  style: "thanks" | "best" | "warmly" = "thanks",
  phone?: string | null,
  fromAddress?: string | null,
): string {
  const name = sender.trim() || "Srilaksha";
  const brandLine =
    style === "warmly" && /india sweet house/i.test(brand) ? `${brand}, Kasturinagar` : brand;
  let closing: string;
  if (style === "warmly") closing = `Warmly,\n${name}\n${brandLine}`;
  else if (style === "best") closing = `Best,\n${name}\n${brand}`;
  else closing = `Thanks & Regards\n${name}\n${brand}`;

  const phoneTrim = phone?.trim();
  if (style === "warmly" && phoneTrim) {
    const emailTrim = fromAddress?.trim();
    const contactLine = emailTrim ? `${phoneTrim} | ${emailTrim}` : phoneTrim;
    closing = `${closing}\n\n${contactLine}`;
  }
  return closing;
}

const SAMPLE_ADDRESS_CTAS = [
  /I'd love to send a sample box over to your office as our treat so you can try it out firsthand\. What is the best delivery address to ship it to\?/,
  /I'd love to send a sample box to your office as our treat so you can evaluate the quality yourself\. What is the best delivery address to send it to\?/,
  /Would you be open to trying a sample box with your team at .+\? Just let me know where to ship it!/,
];

function applyCta(paragraphs: string, templateId?: string | null): string {
  if (templateId === "meet_online") {
    for (const cta of SAMPLE_ADDRESS_CTAS) {
      if (cta.test(paragraphs)) {
        return paragraphs.replace(cta, "Open to a 15-minute online walkthrough this week?");
      }
    }
    if (/\n[^\n]+\?\s*$/.test(paragraphs)) {
      return paragraphs.replace(/\n[^\n]+\?\s*$/, "\nOpen to a 15-minute online walkthrough this week?");
    }
    return `${paragraphs}\n\nOpen to a 15-minute online walkthrough this week?`;
  }
  if (templateId === "meet_in_person") {
    for (const cta of SAMPLE_ADDRESS_CTAS) {
      if (cta.test(paragraphs)) {
        return paragraphs.replace(cta, "Open to a brief in-person tasting at your office?");
      }
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
  closing: "thanks" | "best" | "warmly" = "thanks",
  phone?: string | null,
  fromAddress?: string | null,
): string {
  return `Hi ${first},\n\n${paragraphs}\n\n${signOff(sender, brand, closing, phone, fromAddress)}`;
}

/** Sequences 1, 2, 3 from the ISH cold-email file. */
export function getIshSequenceEmails(params: IshFillParams): IshEmail[] {
  const first = params.contactFirstName || "there";
  const company = companyNameForEmail(params.companyName);
  const sender = params.senderFirstName?.trim() || "Srilaksha";
  const brand = params.brandName?.trim() || "India Sweet House";
  const step = params.sequencePosition >= 3 ? 3 : params.sequencePosition === 2 ? 2 : 1;
  const cta = step === 1 ? params.templateId : undefined;
  const phone = params.senderPhone;
  const fromAddress = params.fromAddress;

  const sequences: Array<Array<{ subject: string; paragraphs: string }>> = [
    [
      {
        subject: `A festive sample for ${company}`,
        paragraphs: `A festive gift shouldn't just be another line item. It's a real reflection of how much you value your team at ${company}.\n\nTo match that standard, ${brand} makes every sweet the exact same way we would for our own family. Because we use 100% pure ghee and fresh dairy straight from our own Karma Farm, everything is handcrafted with clean ingredients, zero varak, and no chemicals so every box carries that genuine, home-style warmth.\n\nI'd love to send a sample box over to your office as our treat so you can try it out firsthand. What is the best delivery address to ship it to?`,
      },
      {
        subject: `Re: A festive sample for ${company}`,
        paragraphs: `${brand} is known for a wide menu: more than 200 traditional sweets and namkeens, plus diet-conscious picks like Jaggery Kaju Katli and Sugarfree Honey Laddu, all made with organic milk from our own farm.\n\nIf ${company} wants festive gifting that feels thoughtful, a tasting box shows it fastest.\n\nWould you be open to a sample box for ${company} this week? Just reply with the best address to ship it to.`,
      },
      {
        subject: `Re: A festive sample for ${company}`,
        paragraphs: `I don't want to keep filling your inbox, so I'll leave it here. If festive gifting at ${company} comes up later, ${brand} is still happy to send a sample box from Karma Farm.\n\nIf a sample box would still help the team at ${company}, reply with where to ship it. I won't email further, but the door stays open if you want to reach out.\n\nWishing you a happy festival season.`,
      },
    ],
    [
      {
        subject: `Festive sweets sample for ${company}`,
        paragraphs: `A festive gift shouldn't just be another line item. It's a real reflection of how much you value your team at ${company}.\n\nTo match that standard, ${brand} makes sweets with the same care we use at home. We start with 100% pure ghee and fresh milk from our own farm, skipping varak and chemicals, and handcrafting every batch so your gesture feels warm, personal, and truly special.\n\nI'd love to send a sample box to your office as our treat so you can evaluate the quality yourself. What is the best delivery address to send it to?`,
      },
      {
        subject: `Re: Festive sweets sample for ${company}`,
        paragraphs: `What sets ${brand} apart is ownership of the dairy: organic milk from Karma Farm, mithai crafted fresh every morning, and recipes our own office votes on before they go out.\n\nIf festive gifting at ${company} should feel that honest, a tasting box shows it fastest.\n\nOpen to a sample box at ${company}? Send me the delivery address and I'll ship one.`,
      },
      {
        subject: `Re: Festive sweets sample for ${company}`,
        paragraphs: `I'll stop following up after this one. If festive gifting for ${company} comes up later, ${brand} is here with Karma Farm mithai and a sample box ready to ship.\n\nIf you'd like a sample box before the season ends, reply with where to ship it at ${company}. I won't email further, but the door stays open. Wishing ${company} a happy festival season.`,
      },
    ],
  ];

  return sequences.map((seq) => {
    const email = seq[step - 1];
    const closing = step === 1 ? "warmly" : "thanks";
    return {
      subject: email.subject,
      body: wrap(
        first,
        sender,
        brand,
        applyCta(email.paragraphs, cta),
        closing,
        closing === "warmly" ? phone : undefined,
        closing === "warmly" ? fromAddress : undefined,
      ),
    };
  });
}

export function fillIshDraftVariants(params: IshFillParams) {
  if (params.occasionId && !isFestiveWriteOccasion(params.occasionId)) {
    const [a, b] = getIshOccasionEmails({
      ...params,
      occasionId: params.occasionId,
    });
    return toDraftCopy(a, b);
  }
  const [a, b] = getIshSequenceEmails(params);
  return toDraftCopy(a, b);
}

function toDraftCopy(a?: IshEmail, b?: IshEmail) {
  return {
    subjectA: a?.subject ?? "",
    subjectB: b?.subject ?? "",
    subjectC: "",
    emailBody: a?.body ?? "",
    emailBodyB: b?.body ?? "",
    emailBodyC: "",
  };
}

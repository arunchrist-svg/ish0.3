import { companyNameForEmail } from "@/lib/email/company-display-name";
import { getIshOccasionEmails } from "@/lib/email/ish-occasion-templates";
import {
  buildIshFestiveCatalogParagraphs,
  buildIshFestiveCatalogParagraphsB,
  buildIshFestiveCatalogSubject,
} from "@/lib/email/ish-festive-catalog";
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
  /** Optional branch/location from Email settings (e.g. Kasturinagar). */
  fromLocation?: string | null;
  /** Free-text signature from Email settings; appended under the closing. */
  signature?: string | null;
  /** Unused for Email 2/3. Catalogue copy lives on the If Opened (position 5) draft. */
  inboxOpened?: boolean;
};

type IshEmail = { subject: string; body: string };

function signOff(
  sender: string,
  brand: string,
  style: "thanks" | "best" | "warmly" = "thanks",
  phone?: string | null,
  fromAddress?: string | null,
  fromLocation?: string | null,
  signature?: string | null,
): string {
  const name = sender.trim() || "Team";
  const sig = signature?.trim() ?? "";

  // Settings signature replaces From name / brand / location under the closing.
  // Multi-line blocks (name, title, company) are the full identity; do not prepend From name.
  if (sig) {
    if (/^(warmly|thanks|best|regards)[,.\s]/i.test(sig)) return sig;
    if (style === "warmly") return `Warmly,\n${sig}`;
    if (style === "best") return `Best,\n${sig}`;
    return `Thanks & Regards\n${sig}`;
  }

  const location = fromLocation?.trim();
  const brandLine = location ? `${brand}, ${location}` : brand;
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
  fromLocation?: string | null,
  greeting: "hi" | "namaste" = "hi",
  signature?: string | null,
): string {
  const hello = greeting === "namaste" ? `Namaste ${first},` : `Hi ${first},`;
  return `${hello}\n\n${paragraphs}\n\n${signOff(sender, brand, closing, phone, fromAddress, fromLocation, signature)}`;
}

function catalogNames(params: IshFillParams) {
  return {
    first: params.contactFirstName || "there",
    company: companyNameForEmail(params.companyName),
    sender: params.senderFirstName?.trim() || "Team",
    brand: params.brandName?.trim() || "India Sweet House",
    phone: params.senderPhone,
    fromAddress: params.fromAddress,
    fromLocation: params.fromLocation,
    signature: params.signature,
  };
}

function catalogFollowUp(params: {
  first: string;
  sender: string;
  brand: string;
  company: string;
  phone?: string | null;
  fromAddress?: string | null;
  fromLocation?: string | null;
  signature?: string | null;
}): IshEmail {
  return {
    subject: buildIshFestiveCatalogSubject(params.company),
    body: wrap(
      params.first,
      params.sender,
      params.brand,
      buildIshFestiveCatalogParagraphs(params.brand),
      "warmly",
      params.phone,
      params.fromAddress,
      params.fromLocation,
      "namaste",
      params.signature,
    ),
  };
}

function catalogFollowUpB(params: {
  first: string;
  sender: string;
  brand: string;
  company: string;
  phone?: string | null;
  fromAddress?: string | null;
  fromLocation?: string | null;
  signature?: string | null;
}): IshEmail {
  return {
    subject: buildIshFestiveCatalogSubject(params.company),
    body: wrap(
      params.first,
      params.sender,
      params.brand,
      buildIshFestiveCatalogParagraphsB(params.brand),
      "warmly",
      params.phone,
      params.fromAddress,
      params.fromLocation,
      "namaste",
      params.signature,
    ),
  };
}

/** If Opened draft: two distinct catalogue options the user can edit. */
export function fillIshCatalogDraftVariants(params: IshFillParams) {
  const names = catalogNames(params);
  return toDraftCopy(catalogFollowUp(names), catalogFollowUpB(names));
}

/** Default sign-off from ISH Festive Gifting Outreach Sequence 2026 (Prasant). */
const PRASANTH_SIGN_OFF =
  "Warm regards,\nPrasant\nCluster Manager, India Sweet House\n+91 92424 20101  |  contact@indiasweethouse.in";

function prasanthWrap(
  paragraphs: string,
  greeting: string,
  signature?: string | null,
): string {
  const sig = signature?.trim();
  const closing = sig
    ? /^(warmly|thanks|best|regards|warm)/i.test(sig)
      ? sig
      : `Warm regards,\n${sig}`
    : PRASANTH_SIGN_OFF;
  return `${greeting}\n\n${paragraphs}\n\n${closing}`;
}

/**
 * Prasant festive sequence from ISH_Festive_Gifting_Outreach_Sequence_2026 V1 FINAL.
 * Three versions per Mail 1 / 2 / 3 (A, B, C). No If Opened / catalogue in that doc.
 */
function buildPrasanthEmails(params: {
  first: string;
  company: string;
  step: number;
  signature?: string | null;
}): IshEmail[] {
  const { company, step, signature } = params;
  const namaste = "Namaste,";

  if (step === 1) {
    return [
      {
        subject: "A small box of Diwali, on its way to you?",
        body: prasanthWrap(
          `I'm Prasant from India Sweet House, we've been part of Bengaluru's festive tables for five years now, working with teams like Infosys, Biocon, Toyota and 3M each Dusshera and Diwali.\n\nRather than open with a pitch, I'd love to just send you a small sample box consisting a few of our handcrafted sweets. Because we use 100% pure ghee and fresh dairy straight from our own Karma Farm, everything is handcrafted with clean ingredients, zero varak, and no chemicals so every box carries that genuine, home-style warmth.\n\nCould you share the best delivery address (and a preferred contact) this week? No commitment needed either way, just want you to taste it for yourself.`,
          namaste,
          signature,
        ),
      },
      {
        subject: "15 minutes, and a box of sweets, this festive season?",
        body: prasanthWrap(
          `I'm Prasant from India Sweet House. Every festive season we help teams across Karnataka put together thoughtful gifting for employees, clients and partners, brands like Mercedes-Benz, Landmark Group and LSEG have worked with us in the past.\n\nInstead of a long pitch over email, I'd rather bring a small tasting box over myself: 15-20 minutes at your office, no obligation, just a chance for your team to try what we make and see if it's a fit for this year's gifting.\n\nWhat makes us stand out? Well, handcrafted sweets with ghee, khova and paneer from our own dairy, Karma Farm, no dalda, no varak, no sugar used as a cheap filler. Every recipe is sensory-tested and handcrafted, with the same quality in our ₹225 Manikya as our premium hampers; nothing diluted to cut cost. 100% recyclable packaging, and the grammage on every box is sweets alone: no shortcuts, no filler weight, no filler sweets.\n\nWould sometime next week work? Happy to fit around your schedule.`,
          namaste,
          signature,
        ),
      },
      {
        subject: "How's the festive gifting shaping up on your end?",
        body: prasanthWrap(
          `Hope the run-up to Dusshera and Diwali has been smooth for your team so far. I'm Prasant from India Sweet House. Over the last five years we've put together festive gifting for 5,000+ corporate teams in Karnataka, without ever cutting corners on what actually goes into the box.\n\n5 years, 55+ outlets, and one rule that hasn't moved: handcrafted with ghee, khova and paneer from our own dairy, Karma Farm, no dalda, no varak, no sugar used as a cheap filler. Even our classics are upgraded, not cost-cut as box fillers, Bombay Halwa is now Cranberry Dry Fruit Halwa, plain Soan Papdi is Chocolate Soan Papdi. And that same quality runs through our most feasible ₹225 Manikya box, not just the premium range. 100% recyclable packaging, with the grammage on every box being sweets alone, never the box's own weight.\n\nIf it's useful, I'd love to either send across a small sample box to your office, or stop by for a quick 15-minute tasting session; whichever works better for you.\n\nDo let me know, and I'll take it from there.`,
          namaste,
          signature,
        ),
      },
    ];
  }

  if (step === 2) {
    return [
      {
        subject: `Following up: our 2026 festive gifting range for ${company}`,
        body: prasanthWrap(
          `Following up on my note last week. In case a quick overview is more useful right now than a call, here's where India Sweet House stands this festive season.\n\nA few things we've never compromised on:\n• Only pure ghee, from our own dairy, Karma Farm, no dalda, no shortcuts.\n• No varak, no diluted recipes. Every sweet is handcrafted and taste-tested by our full team before it earns a place in the box.\n• Our classics are elevated, not simplified. Bombay Halwa is now Cranberry Dry Fruit Halwa, plain Soan Papdi is Chocolate Soan Papdi.\n• Even our most accessible box, the ₹225 Manikya, carries the same handcrafted quality as our premium range, no filler mithai.\n• Every box comes in a 100% recyclable bag, and the grammage you see is sweets alone, we never count the box's own weight.\n\nThis year's collection spans nine ranges, so there's something for every budget and relationship:\n• Manikya & Neelam, everyday gifting, ₹165–₹445\n• Vajra & Vaidurya, our bestselling 500g/1kg khova & dry-fruit assortments\n• Moti, an artisanal range for senior leadership or key clients\n• Kanaka, sweets, dry fruits and sugar-free options in one box, travels well outstation\n• Gomedh, premium dry fruit trays\n• Praval, full luxury hampers with sweets, savouries and curated extras\n• Panna, our namkeen range, a perfect companion to any box\n\nWe also offer e-gift coupons (₹500/₹1,000/₹1,500) if you'd rather let your team choose for themselves, redeemable at any ISH store, valid till March 2027.\n\nHappy to share the full catalogue and put together a shortlist based on ${company}'s headcount and budget, would a quick call this week work?`,
          namaste,
          signature,
        ),
      },
      {
        subject: "The story behind what's in our festive boxes",
        body: prasanthWrap(
          `Just following up on my earlier note. Thought I'd share a bit more about why teams like Infosys, Biocon and Toyota have stayed with India Sweet House for their festive gifting.\n\nFive years ago, ISH began with one simple rule: what goes into the box is exactly what we'd serve at our own family table. That's still true today. We're one of the few sweet brands with our own dairy, Karma Farm (it grew out of a gaushala), so the ghee, khova and paneer in your gift box trace back to a source we know personally. No dalda, no varak, no diluted recipes to cut cost.\n\nEven our classics have been quietly elevated rather than simplified. Bombay Halwa became Cranberry Dry Fruit Halwa, plain Soan Papdi became Chocolate Soan Papdi. And our most accessible box, the ₹225 Manikya, still carries the same handcrafted quality as our ₹3,495 luxury hampers.\n\nThis year's range spans nine collections, from ₹165 everyday boxes to full luxury hampers with sweets, savouries and curated extras, so there's a fit whatever ${company}'s budget or headcount. I'd be glad to send the full catalogue and put together options for your team.\n\nWould a short call this week work, or should I just send the catalogue across first?`,
          namaste,
          signature,
        ),
      },
      {
        subject: `A few gifting options for ${company} this Diwali`,
        body: prasanthWrap(
          `Circling back on my earlier note. Festive gifting decisions often come down to matching the right box to the right budget, so here's a quick breakdown to make that easier:\n\n• Under ₹300/head: Manikya or Neelam, thoughtful, handcrafted, no filler mithai\n• ₹500–₹700/head: Vajra, our bestselling 500g khova & dry-fruit assortment\n• ₹900–₹1,400/head: Vaidurya or Moti, 1kg premium assortments, or an artisanal box for senior leadership and key clients\n• ₹1,000+ and needs to travel: Kanaka, sweets + dry fruits + sugar-free options, great for outstation or international shipping\n• Full hamper experience: Praval, sweets, savouries and curated extras in one gift\n• Prefer flexibility: e-gift coupons (₹500/₹1,000/₹1,500), redeemable at any ISH store till March 2027\n\nEvery box, regardless of price point, uses ghee from our own dairy, has no varak or filler, and comes in a 100% recyclable bag.\n\nIf you can share a rough budget and headcount, I'll put together a shortlist for ${company} and send samples across for a quick taste test before you decide.`,
          namaste,
          signature,
        ),
      },
    ];
  }

  return [
    {
      subject: "Closing the loop before the festive rush hits",
      body: prasanthWrap(
        `I don't want to keep following up without reason, so this will be my last note for now.\n\nProduction for Dusshera and Diwali fills up quickly on our end, and orders confirmed with an advance in the next couple of weeks get a flat minimum 10% off. If ${company}'s festive gifting is still on the table this year, this would be the ideal window to lock in your requirement and get first pick on customization and branding.\n\nIf timing doesn't work this year, that's completely fine. I'll reach out again next season. But if you'd like to move forward, even a quick "yes, let's talk" works and I'll take it from there.`,
        namaste,
        signature,
      ),
    },
    {
      subject: "One last check-in from India Sweet House",
      body: prasanthWrap(
        `Just a quick, final note from my end. I know festive season gets busy, and this may simply have slipped down the list.\n\nIf ${company}'s gifting plans for this year are already sorted, no worries at all. I'll check back in for next season. But if there's still a decision to be made and a sample box or a quick call would help, I'm happy to make that easy on my end, at short notice.\n\nEither way, thank you for your time, and wishing your team a warm Dusshera and Diwali.`,
        namaste,
        signature,
      ),
    },
    {
      subject: `Shall we finalise ${company}'s festive gifting?`,
      body: prasanthWrap(
        `Following up one final time. I'd love to get ${company} onboarded for this festive season before our production calendar fills up.\n\nIf a custom hamper isn't the right fit right now, our e-gift coupons (₹500/₹1,000/₹1,500) are a simpler alternative, easy to distribute at scale, redeemable at any ISH store, and valid well past the festive rush, so there's no pressure on timing from your end.\n\nCould you let me know either way by [date]? Happy to jump on a 10-minute call if that's easier than email.`,
        namaste,
        signature,
      ),
    },
  ];
}

/** Sequences 1, 2, 3 from the ISH cold-email file. */
export function getIshSequenceEmails(params: IshFillParams): IshEmail[] {
  const first = params.contactFirstName || "there";
  const company = companyNameForEmail(params.companyName);
  const sender = params.senderFirstName?.trim() || "Team";
  const brand = params.brandName?.trim() || "India Sweet House";
  const step = params.sequencePosition >= 3 ? 3 : params.sequencePosition === 2 ? 2 : 1;

  if (params.templateId === "prasanth_sequence") {
    return buildPrasanthEmails({ first, company, step, signature: params.signature });
  }

  const cta = step === 1 ? params.templateId : undefined;
  const phone = params.senderPhone;
  const fromAddress = params.fromAddress;
  const fromLocation = params.fromLocation;
  const signature = params.signature;

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
        closing === "warmly" ? fromLocation : undefined,
        "hi",
        signature,
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
  const emails = getIshSequenceEmails(params);
  return toDraftCopy(emails[0], emails[1], emails[2]);
}

function toDraftCopy(a?: IshEmail, b?: IshEmail, c?: IshEmail) {
  return {
    subjectA: a?.subject ?? "",
    subjectB: b?.subject ?? "",
    subjectC: c?.subject ?? "",
    emailBody: a?.body ?? "",
    emailBodyB: b?.body ?? "",
    emailBodyC: c?.body ?? "",
  };
}

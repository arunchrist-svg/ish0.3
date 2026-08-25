import { companyNameForEmail } from "@/lib/email/company-display-name";
import { isFestiveWriteOccasion, type WriteOccasionId } from "@/lib/occasions/catalog";
import { writeOccasionLabel } from "@/lib/occasions/resolve";

type IshEmail = { subject: string; body: string };

const PRODUCT =
  (brand: string) =>
    `At ${brand}, traditional sweets are crafted fresh every morning with ghee, khova and paneer from our own dairy, Karma Farm.`;

const TASTING_CTA =
  "Since tasting is believing, I would love to send a sample box to your office as our treat. Open to receiving one?";

const TASTING_CTA_ADDRESS =
  "Since tasting is believing, I would love to send a sample box to your office as our treat. What is the best delivery address to ship it to?";

function signOff(
  sender: string,
  brand: string,
  style: "thanks" | "best" = "thanks",
  signature?: string | null,
): string {
  const name = sender.trim() || "Team";
  const sig = signature?.trim() ?? "";
  // Settings signature is the full identity under the closing (no From name / brand duplicate).
  if (sig) {
    if (/^(warmly|thanks|best|regards)[,.\s]/i.test(sig)) return sig;
    if (style === "best") return `Best,\n${sig}`;
    return `Thanks & Regards\n${sig}`;
  }
  if (style === "best") return `Best,\n${name}\n${brand}`;
  return `Thanks & Regards\n${name}\n${brand}`;
}

function wrap(
  first: string,
  sender: string,
  brand: string,
  paragraphs: string,
  closing: "thanks" | "best",
  signature?: string | null,
): string {
  return `Hi ${first},\n\n${paragraphs}\n\n${signOff(sender, brand, closing, signature)}`;
}

function applyCta(paragraphs: string, templateId?: string | null): string {
  const tastingCtas = [TASTING_CTA, TASTING_CTA_ADDRESS];
  if (templateId === "meet_online") {
    for (const cta of tastingCtas) {
      if (paragraphs.includes(cta)) {
        return paragraphs.replace(cta, "Open to a 15-minute online walkthrough this week?");
      }
    }
    if (/\n[^\n]+\?\s*$/.test(paragraphs)) {
      return paragraphs.replace(/\n[^\n]+\?\s*$/, "\nOpen to a 15-minute online walkthrough this week?");
    }
    return `${paragraphs}\n\nOpen to a 15-minute online walkthrough this week?`;
  }
  if (templateId === "meet_in_person") {
    for (const cta of tastingCtas) {
      if (paragraphs.includes(cta)) {
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

type CopyFamily = "opening" | "birthday" | "onboarding" | "pantry" | "empanelment" | "appreciation";

function familyFor(occasion: WriteOccasionId): CopyFamily {
  if (occasion === "store_opening" || occasion === "office_inauguration") return "opening";
  if (occasion === "foundation_day" || occasion === "milestone") return "opening";
  if (occasion === "birthday") return "birthday";
  if (occasion === "onboarding") return "onboarding";
  if (occasion === "pantry") return "pantry";
  if (occasion === "appreciation") return "appreciation";
  return "empanelment";
}

function sequencesFor(
  family: CopyFamily,
  first: string,
  company: string,
  brand: string,
  occasionLabel: string,
  timing?: "upcoming" | "recent",
): Array<Array<{ subject: string; paragraphs: string }>> {
  const product = PRODUCT(brand);
  if (family === "opening") {
    const upcoming = timing !== "recent";
    if (upcoming) {
      return [
        [
          {
            subject: `Sample box for your store coming up, ${first}`,
            paragraphs: `A new store coming up is the right window to lock inauguration mithai, not the week of opening. HQ retail ops usually want one vendor for this outlet and the next two or three.\n\n${product}\n\n${TASTING_CTA}`,
          },
          {
            subject: `Re: Sample box for your store coming up, ${first}`,
            paragraphs: `Retail and HQ teams often plan tasting before shopfit finishes. ${brand} prepares mithai fresh daily with organic milk from our own dairy, from our own dairy, Karma Farm.\n\nA tasting box is the fastest way to judge that for ${company}.\n\nShall I ship one this week?`,
          },
          {
            subject: `Re: Sample box for your store coming up, ${first}`,
            paragraphs: `I don't want to keep filling your inbox, so I'll leave it here. If ${company} wants inauguration mithai for this opening or a standing vendor for the next stores, ${brand} can help with mithai from our own farm.\n\nI won't email further, but a tasting box stays open if you want one.`,
          },
        ],
        [
          {
            subject: `Inauguration mithai sample for ${company}`,
            paragraphs: `Inauguration mithai for a ${occasionLabel.toLowerCase()} should be planned with HQ before opening week, not as a last-minute lobby box. ${brand} can bring that to ${company}: sweets made fresh each day with ghee and khova from our own dairy.\n\nTaste it before you trust it. Open to a sampler this week?`,
          },
          {
            subject: `Re: Inauguration mithai sample for ${company}`,
            paragraphs: `${brand} has more than 200 traditional sweets and namkeens, plus diet-conscious picks like Jaggery Kaju Katli and Sugarfree Honey Laddu.\n\nIf ${company} wants one vendor for this store and the next few, a tasting box shows it fastest.\n\nOpen to receiving one?`,
          },
          {
            subject: `Re: Inauguration mithai sample for ${company}`,
            paragraphs: `I'll stop following up after this one. If a tasting box or quote for upcoming openings is useful later, ${brand} is here with fresh daily mithai from Karma Farm.\n\nI won't email further, but the door stays open.`,
          },
        ],
        [
          {
            subject: "A tasting box for your next opening",
            paragraphs: `For a store coming up, ${brand} can bring mithai from our own farm: organic milk from our dairy, from our own dairy, Karma Farm.\n\nHappy to send a small sampler your way, no obligation, just proof.\n\nWant it sent to ${company} this week?`,
          },
          {
            subject: "Re: A tasting box for your next opening",
            paragraphs: `For openings, authenticity holds up in a crowded lobby. ${brand} sources organic milk from its own dairy, prepares mithai fresh daily, and runs highly hygienic kitchens.\n\nShould I send ${company} a tasting box?`,
          },
          {
            subject: "Re: A tasting box for your next opening",
            paragraphs: `I'll leave it here so I'm not cluttering your inbox. If ${company} has more launches this quarter, ${brand} can help with hygienic production and organic milk from our own dairy.\n\nI won't email further. Feel free to reach out anytime.`,
          },
        ],
      ];
    }
    return [
      [
        {
          subject: `Sample box for your store launch, ${first}`,
          paragraphs: `Most store and office openings already have mithai on the counter. The difference is whether it tastes like a last-minute order or a box you would put next to your brand.\n\n${product}\n\n${TASTING_CTA}`,
        },
        {
          subject: `Re: Sample box for your store launch, ${first}`,
          paragraphs: `Retail and HQ teams often need one vendor for this launch and the next few openings. ${brand} prepares mithai fresh daily with organic milk from our own dairy, from our own dairy, Karma Farm.\n\nA tasting box is the fastest way to judge that for ${company}.\n\nShall I ship one this week?`,
        },
        {
          subject: `Re: Sample box for your store launch, ${first}`,
          paragraphs: `I don't want to keep filling your inbox, so I'll leave it here. If ${company} has another opening or wants a standing vendor for launches, ${brand} can help with mithai from our own farm.\n\nI won't email further, but a tasting box stays open if you want one.`,
        },
      ],
      [
        {
          subject: `Inauguration sweets sample for ${company}`,
          paragraphs: `A ${occasionLabel.toLowerCase()} gift for staff and guests should taste authentic, not like a rushed local box. ${brand} can bring that to ${company}: sweets made fresh each day with ghee and khova from our own dairy.\n\nTaste it before you trust it. Open to a sampler this week?`,
        },
        {
          subject: `Re: Inauguration sweets sample for ${company}`,
          paragraphs: `${brand} has more than 200 traditional sweets and namkeens, plus diet-conscious picks like Jaggery Kaju Katli and Sugarfree Honey Laddu.\n\nIf ${company} wants inauguration boxes that feel thoughtful, a tasting box shows it fastest.\n\nOpen to receiving one?`,
        },
        {
          subject: `Re: Inauguration sweets sample for ${company}`,
          paragraphs: `I'll stop following up after this one. If a tasting box or quote for upcoming openings is useful later, ${brand} is here with fresh daily mithai from Karma Farm.\n\nI won't email further, but the door stays open.`,
        },
      ],
      [
        {
          subject: "A tasting box for your next opening",
          paragraphs: `For store and office launches, ${brand} can bring mithai from our own farm: organic milk from our dairy, from our own dairy, Karma Farm.\n\nHappy to send a small sampler your way, no obligation, just proof.\n\nWant it sent to ${company} this week?`,
        },
        {
          subject: "Re: A tasting box for your next opening",
          paragraphs: `For openings, authenticity holds up in a crowded lobby. ${brand} sources organic milk from its own dairy, prepares mithai fresh daily, and runs highly hygienic kitchens.\n\nShould I send ${company} a tasting box?`,
        },
        {
          subject: "Re: A tasting box for your next opening",
            paragraphs: `I'll leave it here so I'm not cluttering your inbox. If ${company} has more launches this quarter, ${brand} can help with hygienic production and organic milk from our own dairy.\n\nI won't email further. Feel free to reach out anytime.`,
        },
      ],
    ];
  }

  if (family === "birthday") {
    return [
      [
        {
          subject: `Sample box for monthly birthdays, ${first}`,
          paragraphs: `HR already marks birthdays. A small mithai box that month is easier than finding a new vendor each time.\n\n${product}\n\n${TASTING_CTA}`,
        },
        {
          subject: `Re: Sample box for monthly birthdays, ${first}`,
          paragraphs: `A birthday program works when the box is the same quality every month. ${brand} prepares mithai fresh daily with ghee and khova from our own dairy.\n\nHappy to send ${company} a tasting box for the next birthday batch.\n\nShall I ship one this week?`,
        },
        {
          subject: `Re: Sample box for monthly birthdays, ${first}`,
          paragraphs: `I'll leave it here. If a monthly birthday box comes up for ${company}, ${brand} can help with mithai from our own farm.\n\nI won't email further, but a tasting box stays open.`,
        },
      ],
      [
        {
          subject: `Birthday mithai sample for ${company}`,
          paragraphs: `A monthly birthday gift should taste authentic. ${brand} can bring that to ${company}: sweets made fresh each day with ghee and khova from our own dairy.\n\nTaste it before you trust it. Open to a sampler this week?`,
        },
        {
          subject: `Re: Birthday mithai sample for ${company}`,
          paragraphs: `${brand} is known for premium mithai and namkeens, including diet-conscious picks like Jaggery Kaju Katli.\n\nIf ${company} wants birthday boxes that feel thoughtful, a tasting box shows it fastest.\n\nOpen to receiving one?`,
        },
        {
          subject: `Re: Birthday mithai sample for ${company}`,
          paragraphs: `I'll stop following up after this one. If a tasting box for the birthday calendar is useful later, ${brand} is here.\n\nI won't email further, but the door stays open.`,
        },
      ],
      [
        {
          subject: "A tasting box for your birthday calendar",
          paragraphs: `For monthly birthdays, ${brand} can bring mithai from our own dairy, Karma Farm.\n\nHappy to send a small sampler to ${company}, no obligation.\n\nWant it sent this week?`,
        },
        {
          subject: "Re: A tasting box for your birthday calendar",
          paragraphs: `${brand} prepares mithai fresh daily with ghee and khova from Karma Farm.\n\nShould I send ${company} a tasting box?`,
        },
        {
          subject: "Re: A tasting box for your birthday calendar",
          paragraphs: `I'll leave it here so I'm not cluttering your inbox. If birthday gifting for ${company} comes up, ${brand} can help.\n\nI won't email further.`,
        },
      ],
    ];
  }

  if (family === "onboarding") {
    return [
      [
        {
          subject: `Sample box for new joiners, ${first}`,
          paragraphs: `A welcome box on day one is easier to run when the vendor is already sampled and empaneled.\n\n${product}\n\n${TASTING_CTA}`,
        },
        {
          subject: `Re: Sample box for new joiners, ${first}`,
          paragraphs: `${brand} prepares mithai fresh daily with ghee and khova from our own dairy, which holds up in a joining kit.\n\nHappy to send ${company} a tasting box.\n\nShall I ship one this week?`,
        },
        {
          subject: `Re: Sample box for new joiners, ${first}`,
          paragraphs: `I'll leave it here. If new-joiner boxes come up for ${company}, ${brand} can help.\n\nI won't email further, but a tasting box stays open.`,
        },
      ],
      [
        {
          subject: `New-joiner sweets sample for ${company}`,
          paragraphs: `A joining kit should taste authentic, not like a leftover festival box. ${brand} can bring that to ${company}: sweets made fresh each day with ghee and khova from our own dairy.\n\nTaste it before you trust it. Open to a sampler this week?`,
        },
        {
          subject: `Re: New-joiner sweets sample for ${company}`,
          paragraphs: `${brand} has more than 200 traditional sweets and namkeens, plus sugar-conscious picks.\n\nIf ${company} wants welcome boxes that feel thoughtful, a tasting box shows it fastest.\n\nOpen to receiving one?`,
        },
        {
          subject: `Re: New-joiner sweets sample for ${company}`,
          paragraphs: `I'll stop following up after this one. If onboarding boxes are useful later, ${brand} is here.\n\nI won't email further, but the door stays open.`,
        },
      ],
      [
        {
          subject: "A tasting box for your joining kits",
          paragraphs: `For new joiners, ${brand} can bring mithai from our own dairy, Karma Farm.\n\nWant a sampler sent to ${company} this week?`,
        },
        {
          subject: "Re: A tasting box for your joining kits",
          paragraphs: `${brand} sources organic milk from its own dairy and runs highly hygienic kitchens.\n\nShould I send ${company} a tasting box?`,
        },
        {
          subject: "Re: A tasting box for your joining kits",
          paragraphs: `I'll leave it here so I'm not cluttering your inbox. If ${company} ramps hiring, ${brand} can help.\n\nI won't email further.`,
        },
      ],
    ];
  }

  if (family === "pantry") {
    return [
      [
        {
          subject: `Sample box for the office pantry, ${first}`,
          paragraphs: `Pantry namkeen and mithai is a repeating order, not a festival project. Admin teams usually want a rate card, GST invoice, and a SKU list that does not go stale in a week.\n\n${product}\n\n${TASTING_CTA}`,
        },
        {
          subject: `Re: Sample box for the office pantry, ${first}`,
          paragraphs: `${brand} prepares mithai and namkeens fresh, with ghee and khova from our own dairy. Dry-fruit combos last longer for meeting rooms.\n\nHappy to send ${company} a tasting box.\n\nShall I ship one this week?`,
        },
        {
          subject: `Re: Sample box for the office pantry, ${first}`,
          paragraphs: `I'll leave it here. If pantry restock for ${company} comes up, ${brand} can help with mithai from our own farm and namkeen.\n\nI won't email further, but a tasting box stays open.`,
        },
      ],
      [
        {
          subject: `Pantry namkeen sample for ${company}`,
          paragraphs: `Meeting-room snacks should taste clean, not like long-shelf factory mix. ${brand} can bring that to ${company}: sweets and savouries made fresh, using organic milk from our own dairy rather than outsourced supply.\n\nTaste it before you trust it. Open to a sampler this week?`,
        },
        {
          subject: `Re: Pantry namkeen sample for ${company}`,
          paragraphs: `${brand} has more than 200 traditional sweets and namkeens, including lighter picks.\n\nIf ${company} wants a recurring pantry SKU, a tasting box shows it fastest.\n\nOpen to receiving one?`,
        },
        {
          subject: `Re: Pantry namkeen sample for ${company}`,
          paragraphs: `I'll stop following up after this one. If a pantry quote is useful later, ${brand} is here.\n\nI won't email further, but the door stays open.`,
        },
      ],
      [
        {
          subject: "A tasting box for pantry restock",
          paragraphs: `For pantry and meetings, ${brand} can bring mithai from our own dairy and namkeen.\n\nWant a sampler sent to ${company} this week?`,
        },
        {
          subject: "Re: A tasting box for pantry restock",
          paragraphs: `${brand} prepares mithai fresh daily with ghee and khova from Karma Farm.\n\nShould I send ${company} a tasting box?`,
        },
        {
          subject: "Re: A tasting box for pantry restock",
          paragraphs: `I'll leave it here so I'm not cluttering your inbox. If pantry stocking for ${company} comes up, ${brand} can help.\n\nI won't email further.`,
        },
      ],
    ];
  }

  if (family === "appreciation") {
    return [
      [
        {
          subject: `Sample box for team appreciation, ${first}`,
          paragraphs: `Recognition days, appraisals, and town halls need a box that feels like a thank-you, not leftover festival stock.\n\n${product}\n\n${TASTING_CTA}`,
        },
        {
          subject: `Re: Sample box for team appreciation, ${first}`,
          paragraphs: `${brand} prepares mithai fresh daily with ghee and khova from our own dairy.\n\nHappy to send ${company} a tasting box.\n\nShall I ship one this week?`,
        },
        {
          subject: `Re: Sample box for team appreciation, ${first}`,
          paragraphs: `I'll leave it here. If appreciation boxes come up for ${company}, ${brand} can help.\n\nI won't email further, but a tasting box stays open.`,
        },
      ],
      [
        {
          subject: `Appreciation sweets sample for ${company}`,
          paragraphs: `A thank-you box should taste authentic. ${brand} can bring that to ${company}: sweets made fresh each day with ghee and khova from our own dairy.\n\nTaste it before you trust it. Open to a sampler this week?`,
        },
        {
          subject: `Re: Appreciation sweets sample for ${company}`,
          paragraphs: `${brand} has more than 200 traditional sweets and namkeens, plus diet-conscious picks.\n\nIf ${company} wants appreciation boxes that feel thoughtful, a tasting box shows it fastest.\n\nOpen to receiving one?`,
        },
        {
          subject: `Re: Appreciation sweets sample for ${company}`,
          paragraphs: `I'll stop following up after this one. If a tasting box is useful later, ${brand} is here.\n\nI won't email further, but the door stays open.`,
        },
      ],
      [
        {
          subject: "A tasting box for your next thank-you",
          paragraphs: `For recognition and town halls, ${brand} can bring mithai from our own dairy, Karma Farm.\n\nWant it sent to ${company} this week?`,
        },
        {
          subject: "Re: A tasting box for your next thank-you",
          paragraphs: `${brand} sources organic milk from its own dairy and runs highly hygienic kitchens.\n\nShould I send ${company} a tasting box?`,
        },
        {
          subject: "Re: A tasting box for your next thank-you",
          paragraphs: `I'll leave it here so I'm not cluttering your inbox. If appreciation gifting for ${company} comes up, ${brand} can help.\n\nI won't email further.`,
        },
      ],
    ];
  }

  return [
    [
      {
        subject: `Sample box for vendor tasting, ${first}`,
        paragraphs: `Procurement usually wants one empaneled sweets vendor they can call for birthdays, openings, and festivals, not a new search each time.\n\n${product}\n\n${TASTING_CTA}`,
      },
      {
        subject: `Re: Sample box for vendor tasting, ${first}`,
        paragraphs: `${brand} prepares mithai fresh daily with ghee and khova from our own dairy. Rate cards and GST invoicing are available for bulk orders.\n\nHappy to send ${company} a tasting box for evaluation.\n\nShall I ship one this week?`,
      },
      {
        subject: `Re: Sample box for vendor tasting, ${first}`,
        paragraphs: `I'll leave it here. If ${company} wants an empaneled mithai vendor later, ${brand} can help.\n\nI won't email further, but a tasting box stays open.`,
      },
    ],
    [
      {
        subject: `Empanelment sweets sample for ${company}`,
        paragraphs: `A vendor sample should taste like the box you would send to employees and clients. ${brand} can bring that to ${company}: sweets made fresh each day with ghee and khova from our own dairy.\n\nTaste it before you trust it. Open to a sampler this week?`,
      },
      {
        subject: `Re: Empanelment sweets sample for ${company}`,
        paragraphs: `${brand} has more than 200 traditional sweets and namkeens, plus diet-conscious picks, with pan-India delivery for larger orders.\n\nIf ${company} wants a rate card plus tasting, a sample box is the fastest start.\n\nOpen to receiving one?`,
      },
      {
        subject: `Re: Empanelment sweets sample for ${company}`,
        paragraphs: `I'll stop following up after this one. If a tasting box or rate card is useful later, ${brand} is here.\n\nI won't email further, but the door stays open.`,
      },
    ],
    [
      {
        subject: "A tasting box for vendor evaluation",
        paragraphs: `For empanelment, ${brand} can bring mithai from our own farm: organic milk from our dairy, from our own dairy, Karma Farm.\n\nWant a sampler sent to ${company} this week?`,
      },
      {
        subject: "Re: A tasting box for vendor evaluation",
        paragraphs: `${brand} sources organic milk from its own dairy farm and runs highly hygienic kitchens.\n\nShould I send ${company} a tasting box?`,
      },
      {
        subject: "Re: A tasting box for vendor evaluation",
        paragraphs: `I'll leave it here so I'm not cluttering your inbox. If vendor empanelment for ${company} comes up, ${brand} can help.\n\nI won't email further.`,
      },
    ],
  ];
}

export function getIshOccasionEmails(params: {
  contactFirstName: string;
  companyName: string;
  senderFirstName: string;
  brandName: string;
  sequencePosition: number;
  templateId?: string | null;
  occasionId: WriteOccasionId;
  occasionTiming?: "upcoming" | "recent";
  signature?: string | null;
}): IshEmail[] {
  if (isFestiveWriteOccasion(params.occasionId)) {
    return [];
  }
  const first = params.contactFirstName || "there";
  const company = companyNameForEmail(params.companyName);
  const sender = params.senderFirstName?.trim() || "Team";
  const brand = params.brandName?.trim() || "India Sweet House";
  const step = params.sequencePosition >= 3 ? 3 : params.sequencePosition === 2 ? 2 : 1;
  const cta = step === 1 ? params.templateId : undefined;
  const family = familyFor(params.occasionId);
  const sequences = sequencesFor(
    family,
    first,
    company,
    brand,
    writeOccasionLabel(params.occasionId),
    params.occasionTiming,
  );

  return sequences.slice(0, 2).map((seq, i) => {
    const email = seq[step - 1];
    const closing = step === 1 && i === 0 ? "best" : "thanks";
    return {
      subject: email.subject,
      body: wrap(first, sender, brand, applyCta(email.paragraphs, cta), closing, params.signature),
    };
  });
}

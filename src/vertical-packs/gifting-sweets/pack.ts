import type { VerticalPack } from "../types";

export const giftingSweetsPack: VerticalPack = {
  id: "gifting-sweets",
  label: "Corporate sweets & gifting",
  description: "Mithai, hampers, seasonal corporate gifting (sample: India Sweet House)",
  brandTemplate: {
    brandName: "India Sweet House",
    vertical: "sweets_gifting",
    productSummary:
      "Premium pure-ghee mithai, dry fruit hampers, and curated Diwali gift boxes. Bulk pricing from ₹500/person for 200+ employees. Custom-branded boxes and pan-India delivery.",
    buyerPersonas: ["HR Director", "HR Manager", "Admin Head", "Procurement Manager"],
    toneNotes:
      "Festive but plain. Focus on mithai, hampers, and tasting samples. Mention Diwali timing without hype. Not salesy.",
  },
  campaignModes: ["diwali_gifting", "mass_ordering", "festival_bundle", "custom"],
  defaultCampaignMode: "diwali_gifting",
  outreachCtas: [
    {
      id: "gift_sampling",
      label: "Sending a Gift Sampling",
      shortLabel: "Gift Sampling",
      description: "Offer a tasting box to their desk or office",
      ctaInstruction:
        "Primary CTA: offer a Diwali tasting sample (say tasting sample, not complimentary or free). Ask if they are open to receiving one. Do NOT ask for address, phone, or team size in email #1; offer to coordinate details after they reply.",
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
      label: "Meet in person to present samples",
      shortLabel: "Meet In Person",
      description: "Schedule an in-person tasting session at their office",
      ctaInstruction:
        "Primary CTA: propose a 15-min in-person visit to present samples. Ask if they are open to a short visit. Do not ask for address or headcount in email #1.",
    },
  ],
  brandIntelDefaults: {
    productCategory: "Sweets",
    competitorBrands: [
      "Kanti Sweets",
      "Anand Sweets",
      "Haldiram's",
      "MTR Foods",
      "Karachi Bakery",
    ],
  },
  toneHint:
    "Product angle: mithai, hampers, Diwali gifting, tasting samples. Festive but plain language.",
  knowledgeFiles: [
    "knowledge/brand.md",
    "knowledge/rules.md",
    "knowledge/campaign-diwali.md",
    "knowledge/roles.md",
  ],
  searchLexicon: ["mithai", "sweets box", "hamper", "Diwali gift", "festive hamper"],
};

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
    buyerPersonas: ["HR Director", "Head of HR", "Procurement Head", "Procurement Manager"],
    toneNotes:
      "Plain and professional. Focus on mithai, hampers, and tasting samples. Match the occasion (festival, opening, birthday, pantry). Not salesy.",
  },
  campaignModes: ["diwali_gifting", "year_round", "mass_ordering", "festival_bundle", "custom"],
  defaultCampaignMode: "diwali_gifting",
  outreachCtas: [
    {
      id: "gift_sampling",
      label: "Sending a Gift Sampling",
      shortLabel: "Gift Sampling",
      description: "Offer a tasting box to their desk or office",
      ctaInstruction:
        "Primary CTA: offer a tasting sample (say tasting sample, not complimentary or free). Ask if they are open to receiving one. Do NOT ask for address, phone, or team size in email #1; offer to coordinate details after they reply.",
    },
    {
      id: "meet_online",
      label: "Meet online to present",
      shortLabel: "Meet Online",
      description: "Book a short video call to showcase the gift range",
      ctaInstruction:
        "Primary CTA: invite them to a 15-min online presentation of our gift range. Ask if a brief call this week works. No harvesting of personal info.",
    },
    {
      id: "meet_in_person",
      label: "Meet in person to present samples",
      shortLabel: "Meet In Person",
      description: "Schedule an in-person tasting session at their office",
      ctaInstruction:
        "Primary CTA: propose a 15-min in-person visit to present samples. Ask if they are open to a short visit. Do not ask for address or headcount in email #1.",
    },
    {
      id: "prasanth_sequence",
      label: "Prasanth Template",
      shortLabel: "Prasanth",
      description: "Prasant's festive sequence — flexible sample-or-visit offer, story-led, warm tone",
      ctaInstruction:
        "Use Prasant's festive outreach style. Greeting: 'Namaste [Name]'. Open by naming ISH's 5-year track record and 2-3 relevant reference clients (Infosys, Biocon, Toyota, 3M, Mercedes-Benz, Landmark Group, LSEG — pick what fits the lead's sector). Primary CTA: offer BOTH options and let the recipient choose — (a) send a small sample box to their office, OR (b) a 15–20 minute in-person tasting at their office; say whichever works better for them. Do NOT ask for address, headcount, or phone in email #1. Mention that everything is handcrafted with ghee from ISH's own dairy (Karma Farm). Sign off as 'Prasant, Cluster Manager, India Sweet House'. Tone: warm, personal, no sales pressure.",
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
  pipelineLabels: {
    stages: ["Contact Ready", "Email", "Email Sent", "Replied", "Tasting Sent", "Negotiate", "Closed"],
    postReplyStatusLabel: "Tasting Sent",
    markPostReplyAction: "Mark tasting sent",
  },
  toneHint:
    "Product angle: mithai, hampers, tasting samples. Match the occasion (festival, store opening, birthday, pantry, empanelment). Plain language.",
  knowledgeFiles: [
    "knowledge/brand.md",
    "knowledge/rules.md",
    "knowledge/campaign-diwali.md",
    "knowledge/campaign-openings.md",
    "knowledge/campaign-programs.md",
    "knowledge/occasions.md",
    "knowledge/roles.md",
  ],
  searchLexicon: ["mithai", "sweets box", "hamper", "Diwali gift", "festive hamper", "inauguration", "new store", "opening soon", "coming soon"],
};

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
      label: "Prasant Template",
      shortLabel: "Prasant",
      description: "Fixed festive copy from Prasant's doc (name/company only). No AI tokens or write credits.",
      ctaInstruction:
        "STRICT FORMAT: follow this exactly. Do NOT deviate from the structure below.\n\nGREETING: MUST be 'Namaste,'. NEVER use 'Hi', 'Dear', 'Sir/Ma'am', or the contact's first name.\n\nOPENING LINE: 'I'm Prasant from India Sweet House. Over the last five years we've put together festive gifting for 5,000+ corporate teams in Karnataka, without ever cutting corners on what actually goes into the box.' (adapt the intro sentence for the occasion but keep the 5,000+ teams and 5 years). Then add 2-3 reference clients relevant to the lead's sector from: Infosys, Biocon, Toyota, 3M, Mercedes-Benz, Landmark Group, LSEG.\n\nUSP PARAGRAPH: Include this block naturally: '5 years, 55+ outlets, and one rule that hasn't moved: handcrafted with ghee, khova and paneer from our own dairy, Karma Farm, no dalda, no varak, no sugar used as a cheap filler. Even our classics are upgraded, not cost-cut as box fillers, Bombay Halwa is now Cranberry Dry Fruit Halwa, plain Soan Papdi is Chocolate Soan Papdi. And that same quality runs through our most feasible ₹225 Manikya box, not just the premium range. 100% recyclable packaging, with the grammage on every box being sweets alone, never the box's own weight.'\n\nCTA: Offer BOTH options: 'I'd love to either send across a small sample box to your office, or stop by for a quick 15-minute tasting session; whichever works better for you. Do let me know, and I'll take it from there.' Do NOT ask for delivery address, phone, or headcount in this email.\n\nCLOSING: 'Warm regards,'\n\nSIGN-OFF (exactly as written, no changes): 'Prasant\\nCluster Manager, India Sweet House\\n+91 84313 30292  |  prasantmishra@indiasweethouse.in'",
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

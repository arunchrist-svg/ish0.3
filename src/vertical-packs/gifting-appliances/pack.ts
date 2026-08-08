import type { VerticalPack } from "../types";

export const giftingAppliancesPack: VerticalPack = {
  id: "gifting-appliances",
  label: "Kitchen appliances & rewards",
  description: "Appliance bundles for employee rewards (sample: Prestige)",
  brandTemplate: {
    brandName: "Prestige",
    vertical: "appliances",
    productSummary:
      "Mixer grinders, induction cooktops, pressure cookers, and kitchen appliance bundles for corporate rewards. Volume pricing for 100+ units. Pan-India warranty and service network.",
    buyerPersonas: ["HR Director", "Procurement Manager", "Admin Head", "CEO at SMBs"],
    toneNotes:
      "Practical and direct. Focus on appliances, employee rewards, warranty, and bulk value. Not flashy or promotional.",
  },
  campaignModes: ["mass_ordering", "festival_bundle", "custom"],
  defaultCampaignMode: "mass_ordering",
  outreachCtas: [
    {
      id: "meet_online",
      label: "Meet online to present",
      shortLabel: "Meet Online",
      description: "Book a short video call to showcase appliance bundles",
      ctaInstruction:
        "Primary CTA: invite them to a 15-min online presentation of appliance reward bundles. Ask if a brief call this week works. No harvesting of personal info.",
    },
    {
      id: "gift_sampling",
      label: "Offer a demo unit",
      shortLabel: "Demo Unit",
      description: "Offer a demo or sample unit for HR evaluation",
      ctaInstruction:
        "Primary CTA: offer a demo unit or catalog for their rewards program. Ask if they are open to reviewing options. Do NOT ask for address or headcount in email #1.",
    },
    {
      id: "meet_in_person",
      label: "Meet in person",
      shortLabel: "Meet In Person",
      description: "Schedule an in-person product walkthrough",
      ctaInstruction:
        "Primary CTA: propose a 15-min in-person visit to present appliance options. Ask if they are open to a short visit. Do not ask for address or headcount in email #1.",
    },
  ],
  brandIntelDefaults: {
    productCategory: "Kitchen Appliances",
    competitorBrands: ["Philips", "Bajaj", "Preethi", "Butterfly", "Havells"],
  },
  toneHint:
    "Product angle: kitchen appliances, employee rewards, warranty, bulk pricing. Practical, not flashy.",
  knowledgeFiles: ["knowledge/brand.md", "knowledge/campaign-mass-ordering.md"],
  searchLexicon: ["air fryer", "mixer grinder", "appliance", "employee gift", "corporate gift"],
};

import type { VerticalPack } from "../types";

export const generalPack: VerticalPack = {
  id: "general",
  label: "General B2B",
  description: "Blank slate for any seller. Brand and campaign come from your setup.",
  brandTemplate: {
    brandName: "Your Company",
    vertical: "general",
    productSummary: "",
    buyerPersonas: ["Founder", "Director", "VP Sales", "Operations Lead"],
    toneNotes: "Friendly but professional. Plain and direct. Not salesy.",
  },
  campaignModes: ["custom", "mass_ordering", "festival_bundle"],
  defaultCampaignMode: "custom",
  outreachCtas: [
    {
      id: "meet_online",
      label: "Meet online",
      shortLabel: "Meet Online",
      description: "Book a short video call to present your offer",
      ctaInstruction:
        "Primary CTA: invite them to a brief online conversation about how you can help their team. Ask if a short call this week works. No harvesting of personal info.",
    },
    {
      id: "gift_sampling",
      label: "Share a demo or trial",
      shortLabel: "Demo / Trial",
      description: "Offer a product demo, trial, or sample if relevant",
      ctaInstruction:
        "Primary CTA: offer a relevant demo, trial, or leave-behind if it fits the product. Ask if they are open to trying it. Do NOT ask for address, phone, or team size in email #1.",
    },
    {
      id: "meet_in_person",
      label: "Meet in person",
      shortLabel: "Meet In Person",
      description: "Propose a short in-person visit",
      ctaInstruction:
        "Primary CTA: propose a short in-person visit to present options. Ask if they are open to a visit. Do not ask for address or headcount in email #1.",
    },
  ],
  brandIntelDefaults: {
    productCategory: "",
    competitorBrands: [],
  },
  pipelineLabels: {
    stages: ["Contact Ready", "Email", "Email Sent", "Replied", "Meeting", "Negotiate", "Closed"],
    postReplyStatusLabel: "Meeting",
    markPostReplyAction: "Mark meeting",
  },
  toneHint: "Product angle: use the product summary below. Stay factual, not promotional.",
  knowledgeFiles: [],
  searchLexicon: ["B2B software", "SaaS", "enterprise sales", "team productivity", "workflow"],
};

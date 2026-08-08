import type { CampaignMode } from "@/lib/email/config";

export type VerticalPackId = "general" | "gifting-sweets" | "gifting-appliances";

export type PackBrandTemplate = {
  brandName: string;
  vertical: string;
  productSummary: string;
  buyerPersonas: string[];
  toneNotes: string;
};

export type PackOutreachCta = {
  id: string;
  label: string;
  shortLabel: string;
  description: string;
  ctaInstruction: string;
};

export type PackBrandIntelDefaults = {
  productCategory: string;
  competitorBrands: string[];
};

export type VerticalPack = {
  id: VerticalPackId;
  label: string;
  description: string;
  brandTemplate: PackBrandTemplate;
  campaignModes: CampaignMode[];
  defaultCampaignMode: CampaignMode;
  outreachCtas: PackOutreachCta[];
  brandIntelDefaults: PackBrandIntelDefaults;
  toneHint: string;
  /** Relative paths under src/vertical-packs/{id}/ */
  knowledgeFiles: string[];
  /** Extra search lexicon phrases for Brand Intelligence queries */
  searchLexicon?: string[];
};

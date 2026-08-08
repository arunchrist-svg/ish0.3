/**
 * Platform intent: what the client will use Nebula for.
 * Drives vertical pack, campaign-mode dropdowns, and Scout fallbacks.
 */
import type { CampaignMode, VerticalPackId } from "@/lib/email/config";
import { getVerticalPack } from "@/vertical-packs";

export type PlatformIntent =
  | "b2b_saas"
  | "corporate_gifting"
  | "appliances"
  | "general_b2b";

export type PlatformIntentOption = {
  value: PlatformIntent;
  label: string;
  desc: string;
};

export const PLATFORM_INTENT_OPTIONS: PlatformIntentOption[] = [
  {
    value: "b2b_saas",
    label: "B2B SaaS / software sales",
    desc: "Sell software or digital services. Scout decision-makers and write product-led outreach.",
  },
  {
    value: "corporate_gifting",
    label: "Corporate gifting (sweets & hampers)",
    desc: "Seasonal and bulk employee gifting. Scout HR / Admin / Procurement.",
  },
  {
    value: "appliances",
    label: "Appliances & corporate rewards",
    desc: "Kitchen appliances, volume orders, and reward programs.",
  },
  {
    value: "general_b2b",
    label: "General B2B outreach",
    desc: "Any other B2B offer. You define product summary and scout filters.",
  },
];

const INTENT_TO_PACK: Record<PlatformIntent, VerticalPackId> = {
  b2b_saas: "general",
  corporate_gifting: "gifting-sweets",
  appliances: "gifting-appliances",
  general_b2b: "general",
};

export function verticalPackIdForIntent(intent: PlatformIntent): VerticalPackId {
  return INTENT_TO_PACK[intent];
}

export function intentFromVerticalPackId(packId?: VerticalPackId | string | null): PlatformIntent {
  if (packId === "gifting-sweets") return "corporate_gifting";
  if (packId === "gifting-appliances") return "appliances";
  return "general_b2b";
}

/** Infer intent from website-extracted vertical + copy. */
export function inferPlatformIntent(params: {
  vertical?: string;
  productSummary?: string;
  buyerPersonas?: string[];
}): PlatformIntent {
  const blob = [
    params.vertical ?? "",
    params.productSummary ?? "",
    ...(params.buyerPersonas ?? []),
  ]
    .join(" ")
    .toLowerCase();

  if (
    /mithai|sweets|hamper|diwali|gifting|gift\s*box(?:es)?|dry\s*fruit|chocolates?/.test(blob) &&
    !/saas|software|platform|crm|api/.test(blob)
  ) {
    return "corporate_gifting";
  }
  if (/appliance|mixer|grinder|kitchen|prestige|volume.?pricing/.test(blob) && /gift|reward|corporate/.test(blob)) {
    return "appliances";
  }
  if (
    /saas|software|platform|cloud|api|crm|erp|devops|analytics|fintech|payment|subscription|b2b.?software/.test(
      blob,
    )
  ) {
    return "b2b_saas";
  }
  if (/consulting|agency|services|manufacturing|logistics/.test(blob)) {
    return "general_b2b";
  }
  return "general_b2b";
}

export function campaignModesForIntent(intent: PlatformIntent): CampaignMode[] {
  return [...getVerticalPack(verticalPackIdForIntent(intent)).campaignModes];
}

export function defaultCampaignModeForIntent(intent: PlatformIntent): CampaignMode {
  return getVerticalPack(verticalPackIdForIntent(intent)).defaultCampaignMode;
}

export type IntentScoutDefaults = {
  buyerPersonas: string[];
  scoutDepartments: string[];
  scoutSeniority: string[];
};

/** Fallbacks when website analysis leaves scout filters thin. */
export function scoutDefaultsForIntent(intent: PlatformIntent): IntentScoutDefaults {
  switch (intent) {
    case "b2b_saas":
      return {
        buyerPersonas: ["Founder", "VP Sales", "Head of Marketing", "CTO", "Operations Lead"],
        scoutDepartments: ["Leadership", "Marketing", "Operations"],
        scoutSeniority: ["Founders", "VP", "Director", "C-Level"],
      };
    case "corporate_gifting":
      return {
        buyerPersonas: ["HR Manager", "Procurement Manager", "Admin Head"],
        scoutDepartments: ["HR", "Procurement", "Admin"],
        scoutSeniority: ["Director", "Manager"],
      };
    case "appliances":
      return {
        buyerPersonas: ["Procurement Manager", "HR Director", "Facilities Head"],
        scoutDepartments: ["Procurement", "HR", "Admin"],
        scoutSeniority: ["Director", "Manager", "VP"],
      };
    default:
      return {
        buyerPersonas: ["Director", "Manager", "Founder", "Operations Lead"],
        scoutDepartments: ["Leadership", "Operations", "Marketing"],
        scoutSeniority: ["Director", "Manager", "Founders"],
      };
  }
}

export function resolvePlatformIntent(
  explicit?: PlatformIntent | string | null,
  packId?: VerticalPackId | string | null,
): PlatformIntent {
  if (
    explicit === "b2b_saas" ||
    explicit === "corporate_gifting" ||
    explicit === "appliances" ||
    explicit === "general_b2b"
  ) {
    return explicit;
  }
  return intentFromVerticalPackId(packId);
}

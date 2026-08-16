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

/**
 * Who you sell to. Used in setup, Scout company filtering, and email copy.
 * Sweets sellers need employer-buyers, not other mithai shops.
 */
export function defaultIcpSummary(intent: PlatformIntent): string {
  switch (intent) {
    case "corporate_gifting":
      return "Companies that gift sweets, mithai, or hampers to employees for festivals, onboarding, and office occasions. Buyers are HR, Admin, and Procurement at those employers, not other sweet shops.";
    case "b2b_saas":
      return "Companies that would buy this software for their own team. Typical buyers are founders, sales, marketing, operations, or IT. Skip retailers that are unrelated, and skip vendors that sell competing software.";
    case "appliances":
      return "Companies that buy kitchen appliances in volume or as employee rewards. Buyers are Procurement, HR, and Facilities.";
    default:
      return "Companies that match this product as buyers, not as competitors.";
  }
}

/** One People-filter stack only. Stacking seniority AND department often returns nobody. */
export function scoutDefaultsForIntent(intent: PlatformIntent): IntentScoutDefaults {
  switch (intent) {
    case "b2b_saas":
      return {
        buyerPersonas: ["Founder", "VP Sales", "Head of Marketing", "CTO", "Operations Lead"],
        scoutDepartments: [],
        scoutSeniority: ["Founders", "C-Level", "VP"],
      };
    case "corporate_gifting":
      return {
        buyerPersonas: ["HR Director", "HR Manager", "Procurement Manager", "Admin Head"],
        scoutDepartments: ["HR", "Procurement"],
        scoutSeniority: [],
      };
    case "appliances":
      return {
        buyerPersonas: ["Procurement Manager", "HR Director", "Facilities Head"],
        scoutDepartments: ["Procurement", "HR", "Facilities"],
        scoutSeniority: [],
      };
    default:
      return {
        buyerPersonas: ["Director", "Manager", "Founder", "Operations Lead"],
        scoutDepartments: [],
        scoutSeniority: ["Director", "Manager", "Founders"],
      };
  }
}

/** If analysis filled both stacks, keep the stack that matches the offer. */
export function normalizeScoutRoleFilters(
  intent: PlatformIntent,
  departments: string[],
  seniority: string[],
): { scoutDepartments: string[]; scoutSeniority: string[] } {
  const defaults = scoutDefaultsForIntent(intent);
  const scoutDepartments = departments.length ? departments : defaults.scoutDepartments;
  const scoutSeniority = seniority.length ? seniority : defaults.scoutSeniority;
  if (scoutDepartments.length && scoutSeniority.length) {
    if (intent === "b2b_saas" || intent === "general_b2b") {
      return { scoutDepartments: [], scoutSeniority };
    }
    return { scoutDepartments, scoutSeniority: [] };
  }
  return { scoutDepartments, scoutSeniority };
}

export type DecisionMakerChoice = {
  id: string;
  label: string;
  hint: string;
  departments: string[];
  seniority: string[];
};

/** Setup chips: one stack (departments or seniority), never both. */
export function decisionMakerChoicesForIntent(intent: PlatformIntent): DecisionMakerChoice[] {
  switch (intent) {
    case "corporate_gifting":
      return [
        { id: "hr", label: "HR / People", hint: "HR Manager, HR Director, CHRO", departments: ["HR"], seniority: [] },
        { id: "admin", label: "Admin", hint: "Admin Head", departments: ["Admin"], seniority: [] },
        { id: "procurement", label: "Procurement", hint: "Purchase, Sourcing", departments: ["Procurement"], seniority: [] },
      ];
    case "appliances":
      return [
        { id: "procurement", label: "Procurement", hint: "Volume buyers", departments: ["Procurement"], seniority: [] },
        { id: "hr", label: "HR", hint: "Employee rewards", departments: ["HR"], seniority: [] },
        { id: "facilities", label: "Facilities", hint: "Pantry and office", departments: ["Facilities"], seniority: [] },
      ];
    case "b2b_saas":
      return [
        { id: "founders", label: "Founders", hint: "Founder, co-founder", departments: [], seniority: ["Founders"] },
        { id: "clevel", label: "C-Level", hint: "CEO, CTO, COO", departments: [], seniority: ["C-Level"] },
        { id: "vp", label: "VP", hint: "VP Sales, VP Marketing", departments: [], seniority: ["VP"] },
      ];
    default:
      return [
        { id: "director", label: "Director", hint: "Directors who buy", departments: [], seniority: ["Director"] },
        { id: "manager", label: "Manager", hint: "Managers who buy", departments: [], seniority: ["Manager"] },
        { id: "founders", label: "Founders", hint: "Founder-led teams", departments: [], seniority: ["Founders"] },
      ];
  }
}

export function rolesFromDecisionMakerIds(
  intent: PlatformIntent,
  ids: string[],
): { scoutDepartments: string[]; scoutSeniority: string[] } {
  const choices = decisionMakerChoicesForIntent(intent);
  const selected = choices.filter((c) => ids.includes(c.id));
  const use = selected.length ? selected : choices.filter((c) => {
    const d = scoutDefaultsForIntent(intent);
    return (
      (c.departments.length > 0 && c.departments.every((x) => d.scoutDepartments.includes(x))) ||
      (c.seniority.length > 0 && c.seniority.every((x) => d.scoutSeniority.includes(x)))
    );
  });
  const departments = [...new Set(use.flatMap((c) => c.departments))];
  const seniority = [...new Set(use.flatMap((c) => c.seniority))];
  return normalizeScoutRoleFilters(intent, departments, seniority);
}

export function decisionMakerIdsFromRoles(
  intent: PlatformIntent,
  departments: string[],
  seniority: string[],
): string[] {
  return decisionMakerChoicesForIntent(intent)
    .filter((c) => {
      if (c.departments.length) return c.departments.every((d) => departments.includes(d));
      if (c.seniority.length) return c.seniority.every((s) => seniority.includes(s));
      return false;
    })
    .map((c) => c.id);
}

/** Extra LLM rules so Scout keeps buyer companies, not lookalike sellers. */
export function icpCompanyFilterInstructions(params: {
  platformIntent?: PlatformIntent | null;
  icpSummary?: string | null;
  productSummary?: string | null;
}): string | null {
  const icp = params.icpSummary?.trim();
  const product = params.productSummary?.trim();
  const intent = params.platformIntent;
  const lines: string[] = [];
  if (icp) {
    lines.push(`Buyer ICP: ${icp}`);
    lines.push("Keep companies that match this buyer profile. Drop the seller's competitors and companies that clearly would not buy.");
  }
  if (intent === "corporate_gifting") {
    lines.push(
      "This seller sells corporate sweets or hampers. Keep employer companies (factories, offices, IT, manufacturing, healthcare, banks) that could gift to employees. Drop mithai shops, bakeries, sweet retailers, hamper stores, and other gift sellers.",
    );
  } else if (intent === "b2b_saas") {
    lines.push(
      "This seller sells B2B software. Keep companies that could buy that software as customers. Drop unrelated retail shops and competing software vendors of the same category.",
    );
  } else if (intent === "appliances") {
    lines.push(
      "Keep companies that could place volume appliance or reward orders. Drop retail appliance stores that only sell to consumers.",
    );
  }
  if (product && !icp) {
    lines.push(`Seller offer: ${product.slice(0, 280)}`);
  }
  return lines.length ? lines.join("\n") : null;
}

/**
 * Brand Intelligence tracks which product a company currently buys from a competitor.
 * That signal is strong for physical goods, weak for software.
 */
export function brandIntelRecommendedForIntent(intent: PlatformIntent | null | undefined): boolean {
  return intent === "corporate_gifting" || intent === "appliances";
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

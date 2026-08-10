export type CreditCostItem = {
  action: string;
  credits: number;
  label: string;
  detail: string;
};

/** Single source of truth for workspace credit prices. */
export const CREDIT_COST_CATALOG: CreditCostItem[] = [
  {
    action: "scout.company",
    credits: 5,
    label: "Scout a company",
    detail: "Charged once per company returned in a scout run",
  },
  {
    action: "scout.contact",
    credits: 3,
    label: "Scout a contact",
    detail: "Charged once per decision-maker found",
  },
  {
    action: "enrich.paid",
    credits: 15,
    label: "Paid enrichment",
    detail: "Apollo or Hunter lookup for a missing work email",
  },
  {
    action: "research.brief",
    credits: 10,
    label: "Research brief",
    detail: "First AI research brief for a lead",
  },
  {
    action: "writer.draft",
    credits: 8,
    label: "Writing smart emails",
    detail: "One smart email draft. A 3-email sequence costs 24",
  },
  {
    action: "writer.revision",
    credits: 3,
    label: "Revise a draft",
    detail: "User-requested rewrite of an existing draft",
  },
  {
    action: "email.live",
    credits: 2,
    label: "Live email send",
    detail: "Charged per recipient when mail actually goes out",
  },
  {
    action: "linkedin.import",
    credits: 50,
    label: "LinkedIn import",
    detail: "One LinkedIn CSV or connection import",
  },
  {
    action: "gift-intel.sweep",
    credits: 20,
    label: "Gift-intel sweep",
    detail: "Charged per brand and occasion combination",
  },
];

export const CREDIT_COSTS: Record<string, number> = Object.fromEntries(
  CREDIT_COST_CATALOG.map((item) => [item.action, item.credits]),
);

export type CreditAction = (typeof CREDIT_COST_CATALOG)[number]["action"];

export function labelForCreditAction(action: string): string {
  return CREDIT_COST_CATALOG.find((item) => item.action === action)?.label ?? action;
}

export function getCreditCost(action: string): number {
  return CREDIT_COSTS[action] ?? 0;
}

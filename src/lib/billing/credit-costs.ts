export const CREDIT_COSTS: Record<string, number> = {
  "scout.company": 5,
  "scout.contact": 3,
  "enrich.paid": 15,
  "research.brief": 10,
  "writer.draft": 8,
  "writer.revision": 3,
  "email.live": 2,
  "linkedin.import": 50,
  "gift-intel.sweep": 20,
};

export type CreditAction = keyof typeof CREDIT_COSTS;

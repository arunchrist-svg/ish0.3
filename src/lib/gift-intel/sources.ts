import type { GiftIntelSourceId, SourceTier } from "./types";

export type GiftIntelSource = {
  id: GiftIntelSourceId;
  tier: SourceTier;
  label: string;
  domains: string[];
  pathHints: string[];
  queriesPerSweep: number;
  resultsPerQuery: number;
  enabledByDefault: boolean;
};

export const GIVER_INTENT_PHRASES = [
  "gift from office",
  "gift from company",
  "corporate gift",
  "employee gift",
  "diwali gift",
  "diwali hamper",
  "festive hamper",
  "festival gift",
  "thank hr",
  "thank my company",
  "our company gifted",
  "employer gifted",
  "received from work",
  "office gift",
  "unboxing",
  "company gifted",
  "gift from work",
];

export const OCCASION_PHRASES = [
  "Diwali",
  "New Year",
  "onboarding",
  "work anniversary",
  "Women's Day",
];

export const EXCLUDED_DOMAINS = [
  "amazon.in",
  "flipkart.com",
  "myntra.com",
  "croma.com",
  "naukri.com",
  "indeed.com",
  "justdial.com",
  "indiamart.com",
];

export const PERSONAL_PURCHASE_REJECT = [
  /buy now/i,
  /shop now/i,
  /discount/i,
  /coupon/i,
  /my order/i,
  /\bi bought\b/i,
  /add to cart/i,
];

export const GIFT_INTEL_SOURCES: GiftIntelSource[] = [
  {
    id: "linkedin_posts",
    tier: 1,
    label: "LinkedIn posts",
    domains: ["linkedin.com"],
    pathHints: ["/posts", "/feed"],
    queriesPerSweep: 2,
    resultsPerQuery: 6,
    enabledByDefault: true,
  },
  {
    id: "instagram_reels",
    tier: 1,
    label: "Instagram",
    domains: ["instagram.com"],
    pathHints: ["/reel", "/p/"],
    queriesPerSweep: 2,
    resultsPerQuery: 6,
    enabledByDefault: true,
  },
  {
    id: "x_posts",
    tier: 1,
    label: "X / Twitter",
    domains: ["x.com", "twitter.com"],
    pathHints: [],
    queriesPerSweep: 2,
    resultsPerQuery: 6,
    enabledByDefault: true,
  },
  {
    id: "india_business_news",
    tier: 2,
    label: "Business news",
    domains: [
      "economictimes.indiatimes.com",
      "indianexpress.com",
      "moneycontrol.com",
      "livemint.com",
      "business-standard.com",
      "hindustantimes.com",
    ],
    pathHints: [],
    queriesPerSweep: 2,
    resultsPerQuery: 5,
    enabledByDefault: true,
  },
  {
    id: "india_startup_news",
    tier: 2,
    label: "Startup news",
    domains: ["yourstory.com", "inc42.com", "entrackr.com"],
    pathHints: [],
    queriesPerSweep: 1,
    resultsPerQuery: 5,
    enabledByDefault: true,
  },
  {
    id: "india_lifestyle_news",
    tier: 2,
    label: "Lifestyle news",
    domains: ["newsx.com", "timesofindia.indiatimes.com"],
    pathHints: [],
    queriesPerSweep: 1,
    resultsPerQuery: 5,
    enabledByDefault: true,
  },
  {
    id: "glassdoor",
    tier: 3,
    label: "Glassdoor",
    domains: ["glassdoor.co.in", "glassdoor.com"],
    pathHints: [],
    queriesPerSweep: 1,
    resultsPerQuery: 4,
    enabledByDefault: false,
  },
  {
    id: "ambitionbox",
    tier: 3,
    label: "AmbitionBox",
    domains: ["ambitionbox.com"],
    pathHints: [],
    queriesPerSweep: 1,
    resultsPerQuery: 4,
    enabledByDefault: false,
  },
  {
    id: "reddit_india",
    tier: 4,
    label: "Reddit India",
    domains: ["reddit.com"],
    pathHints: ["/r/india", "/r/developersIndia", "/r/IndianWorkplace"],
    queriesPerSweep: 1,
    resultsPerQuery: 4,
    enabledByDefault: false,
  },
  {
    id: "gifting_roundups",
    tier: 5,
    label: "Gifting roundups",
    domains: ["marketingmonk.so"],
    pathHints: [],
    queriesPerSweep: 1,
    resultsPerQuery: 4,
    enabledByDefault: false,
  },
];

const GIFT_PHRASE_OR = GIVER_INTENT_PHRASES.slice(0, 8)
  .map((p) => `"${p}"`)
  .join(" OR ");

const NEWS_GIFT_PHRASE_OR = '("employee gift" OR "office gift" OR "Diwali gift" OR "corporate gift")';

function siteClause(source: GiftIntelSource): string {
  return source.domains.map((d) => `site:${d}`).join(" OR ");
}

function buildLinkedInQuery(brand: string): string {
  return `site:linkedin.com/posts "${brand}" (${GIFT_PHRASE_OR}) India`;
}

function buildInstagramQuery(brand: string): string {
  return `site:instagram.com/reel "${brand}" ("office gift" OR "Diwali" OR unboxing) India`;
}

function buildXQuery(brand: string): string {
  return `site:x.com "${brand}" ("Diwali gift" OR "corporate gift" OR "gift from office")`;
}

function buildNewsQuery(source: GiftIntelSource, brand: string): string {
  return `(${siteClause(source)}) "${brand}" ${NEWS_GIFT_PHRASE_OR}`;
}

function buildWorkplaceQuery(source: GiftIntelSource, brand: string): string {
  return `site:${source.domains[0]} "${brand}" (gift OR hamper OR Diwali)`;
}

function buildRedditQuery(brand: string): string {
  return `site:reddit.com/r/india OR site:reddit.com/r/developersIndia "${brand}" ("office gift" OR "Diwali gift" OR "corporate gift")`;
}

function buildRoundupQuery(brand: string): string {
  return `site:marketingmonk.so "${brand}" ("Diwali gift" OR "corporate gift")`;
}

function buildCategoryAnchor(category: string): string | null {
  const lower = category.toLowerCase();
  if (lower.includes("kitchen") || lower.includes("appliance")) {
    return '("air fryer" OR "mixer grinder" OR appliance)';
  }
  if (lower.includes("sweet") || lower.includes("mithai")) {
    return '("mithai" OR "sweets box" OR hamper)';
  }
  return null;
}

export function buildQueriesForSource(
  source: GiftIntelSource,
  brand: string,
  category: string,
  city?: string,
): string[] {
  const queries: string[] = [];
  const categoryAnchor = buildCategoryAnchor(category);

  for (let i = 0; i < source.queriesPerSweep; i++) {
    let q: string;
    switch (source.id) {
      case "linkedin_posts":
        q = buildLinkedInQuery(brand);
        break;
      case "instagram_reels":
        q = buildInstagramQuery(brand);
        break;
      case "x_posts":
        q = buildXQuery(brand);
        break;
      case "india_business_news":
      case "india_startup_news":
      case "india_lifestyle_news":
        q = buildNewsQuery(source, brand);
        break;
      case "glassdoor":
      case "ambitionbox":
        q = buildWorkplaceQuery(source, brand);
        break;
      case "reddit_india":
        q = buildRedditQuery(brand);
        break;
      case "gifting_roundups":
        q = buildRoundupQuery(brand);
        break;
      default:
        q = `${siteClause(source)} "${brand}" (${GIFT_PHRASE_OR})`;
    }

    if (categoryAnchor && i === 1) {
      q = `${q} ${categoryAnchor}`;
    }

    if (i === 1 && OCCASION_PHRASES[i % OCCASION_PHRASES.length]) {
      q = `${q} ${OCCASION_PHRASES[i % OCCASION_PHRASES.length]}`;
    }

    if (city?.trim()) {
      q = `${q} "${city.trim()}"`;
    }

    queries.push(q);
  }

  return queries;
}

export function getEnabledSources(enabledTiers: SourceTier[]): GiftIntelSource[] {
  const tierSet = new Set(enabledTiers);
  return GIFT_INTEL_SOURCES.filter((s) => tierSet.has(s.tier));
}

export function uniqueDefaultTiers(): SourceTier[] {
  const tiers = GIFT_INTEL_SOURCES.filter((s) => s.enabledByDefault).map((s) => s.tier);
  return [...new Set(tiers)].sort() as SourceTier[];
}

export function normalizeBrandForMatch(text: string, brand: string, aliases: string[] = []): boolean {
  const hay = text.toLowerCase();
  const terms = [brand, ...aliases].map((t) => t.toLowerCase().trim()).filter(Boolean);
  return terms.some((t) => hay.includes(t));
}

export function passesPreFilter(
  post: { url: string; text: string; title?: string; sourceTier: SourceTier },
  brand: string,
  aliases: string[] = [],
): boolean {
  const urlLower = post.url.toLowerCase();
  if (EXCLUDED_DOMAINS.some((d) => urlLower.includes(d))) return false;

  const combined = `${post.title ?? ""} ${post.text}`.trim();
  if (!normalizeBrandForMatch(combined, brand, aliases)) return false;

  if (PERSONAL_PURCHASE_REJECT.some((re) => re.test(combined))) return false;

  const lower = combined.toLowerCase();
  const hasGiverIntent = GIVER_INTENT_PHRASES.some((p) => lower.includes(p.toLowerCase()));

  if (post.sourceTier <= 2) {
    return hasGiverIntent || /gift|hamper|unboxing|diwali/i.test(combined);
  }

  return hasGiverIntent;
}

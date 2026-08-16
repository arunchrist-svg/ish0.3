import {
  GIFT_INTEL_SOURCES,
  EXCLUDED_DOMAINS,
  type GiftIntelSource,
} from "./sources";
import type { ComingSoonSignalType, GiftIntelSourceId, SourceTier } from "./types";
import { SEARCHABLE_OCCASION_IDS, type OccasionId } from "@/lib/occasions/catalog";

export type OccasionSweepFamily = "openings" | "milestones" | "coming_soon";

export const OPENING_QUERY =
  '("new store" OR inauguration OR "grand opening" OR "store launch" OR "new office" OR "new campus" OR "ribbon cutting")';

export const MILESTONE_QUERY =
  '("foundation day" OR "company anniversary" OR "completes years" OR "raises funding" OR "plant inauguration" OR "new manufacturing")';

export const HIRING_NEW_UNIT_QUERY =
  '("hiring store manager" OR "store manager" OR "store staff" OR "retail staff") ("new store" OR "opening soon" OR "upcoming store" OR "new outlet")';

export const COMING_SOON_LOCATOR_QUERY =
  '("coming soon" OR "will open" OR "to launch" OR "to open" OR "new store in") (store OR outlet OR showroom)';

export const MALL_LEASE_QUERY =
  "(Phoenix OR Brigade OR Prestige OR Forum OR Lulu) (leasing OR \"tenant mix\" OR shopfit OR \"fit-out\" OR \"new store\" OR \"coming soon\")";

export const PRESS_EXPANSION_QUERY =
  '("will open" OR "to launch" OR "new stores this quarter" OR "expansion this quarter" OR "to open stores") (retail OR chain OR stores)';

const JOB_AD_REJECT = [
  /\bwe are hiring\b/i,
  /\bjob opening\b/i,
  /\bapply now\b/i,
  /\bwalk.?in interview\b/i,
  /\bcareer(s)? at\b/i,
];

const DIRECTORY_REJECT = [
  /justdial\.com/i,
  /sulekha\.com/i,
  /indiamart\.com/i,
  /magicbricks\.com/i,
];

const NEW_UNIT =
  /opening soon|coming soon|will open|to (?:launch|open)|new store|new outlet|new showroom|upcoming (?:store|outlet)|shopfit|shop[- ]?fit|fit-?out|tenant mix|pre-opening|before (?:we |the )?open/i;

const WAREHOUSE_DC =
  /\b(warehouse|distribution centre|distribution center|\b[dD][cC]\b hiring|fulfilment|fulfillment|logistics hub|godown)\b/i;

const JUST_OPENED =
  /\b(just opened|opened yesterday|opened last week|inaugurated (?:yesterday|last)|grand opening (?:was|held)|we opened our (?:new )?store (?:yesterday|last))\b/i;

const GENERIC_EXPAND_NO_STORE = /\bwe are expanding\b/i;

export type ComingSoonSource = GiftIntelSource & {
  signalTypes: ComingSoonSignalType[];
};

export const COMING_SOON_SOURCES: ComingSoonSource[] = [
  {
    id: "linkedin_jobs",
    tier: 1,
    label: "LinkedIn jobs",
    domains: ["linkedin.com"],
    pathHints: ["/jobs"],
    queriesPerSweep: 2,
    resultsPerQuery: 6,
    enabledByDefault: true,
    signalTypes: ["hiring"],
  },
  {
    id: "linkedin_posts",
    tier: 1,
    label: "LinkedIn posts",
    domains: ["linkedin.com"],
    pathHints: ["/posts", "/feed"],
    queriesPerSweep: 2,
    resultsPerQuery: 6,
    enabledByDefault: true,
    signalTypes: ["hiring", "coming_soon"],
  },
  {
    id: "careers_web",
    tier: 1,
    label: "Career pages",
    domains: [],
    pathHints: [],
    queriesPerSweep: 2,
    resultsPerQuery: 5,
    enabledByDefault: true,
    signalTypes: ["hiring", "coming_soon"],
  },
  {
    id: "india_business_news",
    tier: 2,
    label: "Business news",
    domains: GIFT_INTEL_SOURCES.find((s) => s.id === "india_business_news")?.domains ?? [
      "economictimes.indiatimes.com",
      "indianexpress.com",
      "moneycontrol.com",
      "livemint.com",
      "business-standard.com",
      "hindustantimes.com",
    ],
    pathHints: [],
    queriesPerSweep: 3,
    resultsPerQuery: 5,
    enabledByDefault: true,
    signalTypes: ["mall_lease", "coming_soon", "press_expansion"],
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
    signalTypes: ["press_expansion"],
  },
];

export function occasionSweepSources(tiers: SourceTier[]): GiftIntelSource[] {
  const allowed = new Set(tiers);
  return GIFT_INTEL_SOURCES.filter(
    (s) => allowed.has(s.tier) && (s.tier === 1 || s.tier === 2),
  );
}

export function comingSoonSweepSources(tiers: SourceTier[]): ComingSoonSource[] {
  const allowed = new Set(tiers);
  return COMING_SOON_SOURCES.filter((s) => allowed.has(s.tier));
}

function withCity(query: string, city?: string): string {
  if (!city?.trim()) return query;
  return `${query} "${city.trim()}"`;
}

function sitePrefix(source: GiftIntelSource): string {
  if (!source.domains.length) return "";
  if (source.id === "linkedin_jobs") return "(site:linkedin.com/jobs) ";
  const site = source.domains.map((d) => `site:${d}`).join(" OR ");
  return `(${site}) `;
}

function phraseForSignal(signal: ComingSoonSignalType): string {
  switch (signal) {
    case "hiring":
      return HIRING_NEW_UNIT_QUERY;
    case "mall_lease":
      return MALL_LEASE_QUERY;
    case "press_expansion":
      return PRESS_EXPANSION_QUERY;
    default:
      return COMING_SOON_LOCATOR_QUERY;
  }
}

export function buildOccasionQueriesForSource(
  source: GiftIntelSource,
  family: OccasionSweepFamily,
  city?: string,
): string[] {
  if (family === "coming_soon") {
    return buildComingSoonQueriesForSource(source as ComingSoonSource, city);
  }
  const phrase = family === "openings" ? OPENING_QUERY : MILESTONE_QUERY;
  const site = source.domains.map((d) => `site:${d}`).join(" OR ");
  const base = `(${site}) ${phrase} India`;
  const queries = [withCity(base, city)];
  if (source.queriesPerSweep > 1) {
    queries.push(withCity(`${base} (mithai OR sweets OR hamper)`, city));
  }
  return queries.slice(0, source.queriesPerSweep);
}

export function buildComingSoonQueriesForSource(source: ComingSoonSource, city?: string): string[] {
  const prefix = sitePrefix(source);
  const queries = source.signalTypes.map((signal) => {
    const extra =
      source.id === "careers_web" && signal === "hiring"
        ? " (careers OR hiring)"
        : source.id === "linkedin_posts" && signal === "hiring"
          ? " hiring"
          : "";
    return withCity(`${prefix}${phraseForSignal(signal)}${extra} India`.trim(), city);
  });
  return queries.slice(0, Math.max(source.queriesPerSweep, source.signalTypes.length));
}

export function signalTypeForComingSoonQuery(
  source: ComingSoonSource,
  queryIndex: number,
): ComingSoonSignalType {
  return source.signalTypes[queryIndex] ?? source.signalTypes[0] ?? "coming_soon";
}

/** Empty domains mean any host except excluded directories. */
export function hitMatchesComingSoonSource(
  url: string,
  domains: string[],
  pathHints: string[],
): boolean {
  const lower = url.toLowerCase();
  if (domains.length === 0) return true;
  if (!domains.some((d) => lower.includes(d))) return false;
  if (pathHints.length === 0) return true;
  return pathHints.some((h) => lower.includes(h));
}

/** Exported so tests can assert queries omit competitor brands. */
export function competitorBrandAbsent(query: string, brand: string): boolean {
  return !query.toLowerCase().includes(`"${brand.toLowerCase()}"`);
}

export function normalizeComingSoonSignalType(raw?: string | null): ComingSoonSignalType | undefined {
  const key = raw?.trim().toLowerCase();
  if (key === "hiring" || key === "coming_soon" || key === "mall_lease" || key === "press_expansion") {
    return key;
  }
  return undefined;
}

export function passesOccasionPreFilter(post: {
  url: string;
  text: string;
  title?: string;
}): boolean {
  const urlLower = post.url.toLowerCase();
  if (EXCLUDED_DOMAINS.some((d) => urlLower.includes(d))) return false;
  if (DIRECTORY_REJECT.some((re) => re.test(urlLower) || re.test(post.text))) return false;

  const combined = `${post.title ?? ""} ${post.text}`.trim();
  if (JOB_AD_REJECT.some((re) => re.test(combined))) return false;

  const lower = combined.toLowerCase();
  const hasEvent =
    /new store|inauguration|grand opening|store launch|new office|new campus|ribbon cutting|foundation day|company anniversary|completes \d+ years|raises (?:\$|usd|rs|inr)|plant inauguration/.test(
      lower,
    );
  if (!hasEvent) return false;

  const personalSolo =
    /\bi opened my\b|\bmy cafe\b|\bmy bakery\b/i.test(combined) &&
    !/\b(pvt|limited|ltd|inc|corp|company|stores?)\b/i.test(combined);
  if (personalSolo) return false;

  return true;
}

export function passesComingSoonPreFilter(post: {
  url: string;
  text: string;
  title?: string;
}): boolean {
  const urlLower = post.url.toLowerCase();
  if (EXCLUDED_DOMAINS.some((d) => urlLower.includes(d))) return false;
  if (DIRECTORY_REJECT.some((re) => re.test(urlLower) || re.test(post.text))) return false;
  if (/instagram\.com/i.test(urlLower)) return false;

  const combined = `${post.title ?? ""} ${post.text}`.trim();
  if (WAREHOUSE_DC.test(combined)) return false;
  if (JUST_OPENED.test(combined)) return false;

  if (!NEW_UNIT.test(combined)) return false;

  if (GENERIC_EXPAND_NO_STORE.test(combined) && !/\b(store|outlet|showroom|mall|retail)\b/i.test(combined)) {
    return false;
  }

  const personalSolo =
    /\bi opened my\b|\bmy cafe\b|\bmy bakery\b/i.test(combined) &&
    !/\b(pvt|limited|ltd|inc|corp|company|stores?)\b/i.test(combined);
  if (personalSolo) return false;

  return true;
}

export function defaultSignalForSourceId(id: GiftIntelSourceId): ComingSoonSignalType | undefined {
  const source = COMING_SOON_SOURCES.find((s) => s.id === id);
  return source?.signalTypes[0];
}

export const OCCASION_EVENT_IDS: OccasionId[] = [...SEARCHABLE_OCCASION_IDS];

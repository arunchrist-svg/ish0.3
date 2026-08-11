import { compactCompanyName, nameMatchesQuery, normalizeCompanyName } from "@/lib/enrichment/company-name-match";

/** Directories, social, and news/publisher hosts that are not a company's email domain. */
const UNUSABLE_COMPANY_DOMAINS = [
  "justdial.com",
  "indiamart.com",
  "sulekha.com",
  "zaubacorp.com",
  "tradeindia.com",
  "tofler.in",
  "crunchbase.com",
  "zoominfo.com",
  "apollo.io",
  "linkedin.com",
  "facebook.com",
  "instagram.com",
  "twitter.com",
  "x.com",
  "youtube.com",
  "wikipedia.org",
  "google.com",
  "github.com",
  "gitlab.com",
  "bitbucket.org",
  "ambitionbox.com",
  "glassdoor.com",
  "indeed.com",
  "naukri.com",
  "screener.in",
  "trendlyne.com",
  "moneycontrol.com",
  "economictimes.com",
  "indiatimes.com",
  "livemint.com",
  "business-standard.com",
  "thehindu.com",
  "thehindubusinessline.com",
  "indianexpress.com",
  "ndtv.com",
  "reuters.com",
  "bloomberg.com",
  "forbes.com",
  "manufacturingtodayindia.com",
  "autocarpro.in",
  "constructionworld.in",
  "constructionweekonline.in",
  "financialexpress.com",
  "businessinsider.in",
  "yourstory.com",
  "inc42.com",
  "entrackr.com",
  "vccircle.com",
  "bseindia.com",
  "nseindia.com",
  "sebi.gov.in",
  "tracxn.com",
  "scribd.com",
  "builtin.com",
  "squareyards.com",
  "confirmtkt.com",
  "yappe.in",
  "fda.gov",
  "windows.net",
];

const UNUSABLE_DOMAIN_FRAGMENTS = [
  "todayindia",
  "indiatimes",
  "economictimes",
  "business-standard",
  "livemint",
  "moneycontrol",
  "timesofindia",
  "news18",
  "newindianexpress",
];

export function normalizeHost(domain?: string | null): string | undefined {
  if (!domain?.trim()) return undefined;
  return domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    ?.split("?")[0];
}

export function isUnusableCompanyDomain(domain?: string | null): boolean {
  const host = normalizeHost(domain);
  if (!host) return false;
  if (!host.includes(".")) return true;
  if (UNUSABLE_COMPANY_DOMAINS.some((blocked) => host === blocked || host.endsWith(`.${blocked}`))) {
    return true;
  }
  return UNUSABLE_DOMAIN_FRAGMENTS.some((fragment) => host.includes(fragment));
}

export function domainSlug(domain?: string | null): string | undefined {
  const host = normalizeHost(domain);
  if (!host) return undefined;
  return host.split(".")[0] || undefined;
}

const GENERIC_BRAND_TOKENS = new Set([
  "india",
  "indian",
  "group",
  "industries",
  "limited",
  "motors",
  "automotive",
  "products",
  "private",
  "services",
  "international",
  "global",
  "technologies",
  "solutions",
  "company",
  "corp",
  "powertrain",
  "pharma",
  "life",
  "steel",
  "steels",
  "foods",
  "auto",
  "cement",
  "mill",
  "mills",
  "works",
  "manufacturing",
  "industrial",
  "plant",
  "energy",
  "power",
  "chemical",
  "chemicals",
  "metal",
  "metals",
  "mining",
  "textile",
  "textiles",
  "construction",
  "engineering",
  "logistics",
  "trading",
  "holdings",
  "enterprise",
  "enterprises",
  "ventures",
]);

export function distinctiveBrandTokens(name: string): string[] {
  return normalizeCompanyName(name)
    .split(" ")
    .filter((token) => token.length >= 3 && !GENERIC_BRAND_TOKENS.has(token));
}

export function domainBelongsToCompany(domain: string, companyName: string): boolean {
  const slug = domainSlug(domain);
  if (!slug || !companyName.trim()) return false;
  if (nameMatchesQuery(slug, companyName)) return true;

  const tokens = distinctiveBrandTokens(companyName);
  for (const token of tokens) {
    if (token.length >= 4 && (slug.includes(token) || token.includes(slug))) return true;
    if (token.length === 3 && (slug === token || slug.startsWith(token))) return true;
  }

  const compact = compactCompanyName(companyName);
  if (compact.length >= 5 && (slug.includes(compact) || compact.includes(slug))) return true;

  return false;
}

export function isAcceptableCompanyDomain(domain: string | null | undefined, companyName?: string | null): boolean {
  const host = normalizeHost(domain);
  if (!host || isUnusableCompanyDomain(host)) return false;
  if (!companyName?.trim()) return true;
  const tokens = normalizeCompanyName(companyName).split(" ").filter((token) => token.length >= 3);
  if (!tokens[0] || tokens[0].length < 3) return true;
  return domainBelongsToCompany(host, companyName);
}

export function emailBelongsToCompany(email: string | null | undefined, companyName?: string | null): boolean {
  const host = email?.split("@")[1]?.trim().toLowerCase();
  if (!host) return false;
  return isAcceptableCompanyDomain(host, companyName);
}

/** Persist only a domain that actually belongs to this company. */
export function usableStoredDomain(
  domain: string | null | undefined,
  companyName: string,
): string | null {
  const host = normalizeHost(domain);
  if (!host || !isAcceptableCompanyDomain(host, companyName)) return null;
  return host;
}

import { extractCompanyDomain, isLogoUrl } from "@/lib/company-logo";
import { normalizeCompanyName } from "@/lib/enrichment/company-name-match";

const WIKI_UA = "ISH-Sales-Accelerator/0.3 (company-logo lookup)";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const GENERIC_TOKENS = new Set([
  "india",
  "indian",
  "private",
  "limited",
  "company",
  "companies",
  "industries",
  "industry",
  "enterprises",
  "enterprise",
  "energy",
  "manufacturing",
  "services",
  "solutions",
  "technologies",
  "technology",
  "group",
  "holdings",
  "international",
  "global",
  "systems",
  "products",
  "engineering",
  "automotive",
  "electronics",
  "semiconductor",
  "semiconductors",
  "corp",
  "corporation",
  "inc",
  "ltd",
  "pvt",
  "plc",
]);

type CacheEntry = { url: string | null; at: number };

const cache = new Map<string, CacheEntry>();

export function clearCompanyLogoCache() {
  cache.clear();
}

function cacheKey(input: { name?: string | null; domain?: string | null; website?: string | null }): string {
  return `${input.name ?? ""}|${input.domain ?? ""}|${input.website ?? ""}`.trim().toLowerCase();
}

export function distinctiveLogoTokens(name: string): string[] {
  return normalizeCompanyName(name)
    .split(" ")
    .filter((token) => token.length >= 4 && !GENERIC_TOKENS.has(token));
}

export function wikiTitleFitsCompany(title: string, companyName: string): boolean {
  const wanted = distinctiveLogoTokens(companyName);
  if (!wanted.length) return false;
  const haystack = normalizeCompanyName(title);
  const have = new Set(haystack.split(" ").filter(Boolean));
  const hits = wanted.filter((token) => have.has(token) || haystack.includes(token));
  if (wanted.length === 1) return hits.length === 1;
  return hits.length >= 2 || hits.length === wanted.length;
}

function httpsUrl(raw?: string | null): string | undefined {
  if (!raw?.trim()) return undefined;
  const value = raw.startsWith("//") ? `https:${raw}` : raw.trim();
  if (!isLogoUrl(value)) return undefined;
  if (value.startsWith("http://")) return `https://${value.slice("http://".length)}`;
  return value;
}

async function fetchJson(url: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": WIKI_UA },
    });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

type WikiPage = { title?: string; thumbnail?: { source?: string } };

async function wikipediaLogoUrl(companyName: string): Promise<string | undefined> {
  const params = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrsearch: companyName,
    gsrlimit: "5",
    prop: "pageimages",
    piprop: "thumbnail",
    pithumbsize: "256",
    format: "json",
    origin: "*",
  });
  const data = await fetchJson(`https://en.wikipedia.org/w/api.php?${params.toString()}`);
  const pages = data?.query && typeof data.query === "object"
    ? (data.query as { pages?: Record<string, WikiPage> }).pages
    : undefined;
  if (!pages) return undefined;

  for (const page of Object.values(pages)) {
    const title = page.title?.trim();
    const src = httpsUrl(page.thumbnail?.source);
    if (!title || !src) continue;
    if (wikiTitleFitsCompany(title, companyName)) return src;
  }
  return undefined;
}

async function duckDuckGoLogoUrl(companyName: string): Promise<string | undefined> {
  const params = new URLSearchParams({
    q: companyName,
    format: "json",
    no_redirect: "1",
    no_html: "1",
    skip_disambig: "1",
  });
  const data = await fetchJson(`https://api.duckduckgo.com/?${params.toString()}`);
  if (!data) return undefined;
  const heading = typeof data.Heading === "string" ? data.Heading : "";
  const rawImage = typeof data.Image === "string" ? data.Image : "";
  const image = httpsUrl(rawImage.startsWith("/") ? `https://duckduckgo.com${rawImage}` : rawImage);
  if (!image || !heading || !wikiTitleFitsCompany(heading, companyName)) return undefined;
  return image;
}

export async function resolveCompanyLogoUrl(input: {
  name?: string | null;
  domain?: string | null;
  website?: string | null;
}): Promise<string | undefined> {
  const name = input.name?.trim();
  const domain = extractCompanyDomain(input);
  const key = cacheKey({ name, domain, website: input.website });
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.url ?? undefined;

  let url: string | undefined;
  if (name) {
    url = await wikipediaLogoUrl(name);
    if (!url) url = await duckDuckGoLogoUrl(name);
  }
  if (!url && domain) {
    url = await wikipediaLogoUrl(domain.split(".")[0] ?? domain);
  }

  cache.set(key, { url: url ?? null, at: Date.now() });
  return url;
}

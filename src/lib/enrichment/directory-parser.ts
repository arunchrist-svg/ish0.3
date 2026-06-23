import type { ScoutCompanyResult } from "./types";
import { expandCitySearchTerms } from "./city-search";

type DirectoryHit = { title: string; url: string; content: string };

const WEEKDAYS = /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/i;
const REGISTRY_JUNK = /^(active|strike off|all of the companies listed|companies incorpated)/i;
const PLACEMENT_JUNK = /^placement consultancy for /i;
const TIME_JUNK = /\d\s*(am|pm)/i;
const CIN_PATTERN = /\bU\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}\b/i;

const LISTING_JUNK =
  /^(top|popular|corporate companies|leading businesses|professional services|name|page \d|find business|near |in |the hudson$)/i;
const GENERIC_JUNK =
  /^(star office|softinu|sandyrtr|embassy icon|newtimes group|vdrone|cuem \(head office\))$/i;

function inferIndustryFromTitle(title: string): string | undefined {
  const t = title.toLowerCase();
  if (t.includes(" for it")) return "IT";
  if (t.includes("pharma") || t.includes("health")) return "Pharma";
  if (t.includes("manufactur")) return "Manufacturing";
  if (t.includes("retail") || t.includes("store")) return "Retail";
  if (t.includes("real estate")) return "Real Estate";
  return "Corporate";
}

const LISTING_TITLE =
  /companies in|businesses in|corporate companies|company directory|business directory|dealers in|manufacturers in/i;

function isListingUrl(url: string): boolean {
  try {
    const segments = new URL(url).pathname.split("/").filter(Boolean);
    const slug = segments[1] ?? "";
    if (CATEGORY_PAGE.test(`/${slug}/`) || /^nct-/i.test(slug)) return true;
    return (
      /companies|businesses|directory|dealers|manufacturers|suppliers/i.test(slug) &&
      !/-ltd|-limited|-pvt|-llp|-inc|-corp/i.test(slug)
    );
  } catch {
    return false;
  }
}

function inferCityFromText(blob: string, cities: string[]): string | undefined {
  const lower = blob.toLowerCase();
  for (const city of cities) {
    for (const term of expandCitySearchTerms([city])) {
      if (lower.includes(term.toLowerCase())) return city;
    }
  }
  return undefined;
}

function inferCityFromSegment(segment: string, cities: string[]): string | undefined {
  return inferCityFromText(segment, cities);
}

function inferCityFromHit(hit: DirectoryHit, cities: string[]): string | undefined {
  if (LISTING_TITLE.test(hit.title) || isListingUrl(hit.url)) return undefined;
  return inferCityFromText(`${hit.content} ${hit.url}`, cities);
}

function cleanCompanyName(raw: string): string | null {
  const name = raw
    .replace(/\(\s*corporate office\s*\)/gi, "(Corporate Office)")
    .replace(/\(\s*head office\s*\)/gi, "(Head Office)")
    .replace(/\(\s*regional office\s*\)/gi, "(Regional Office)")
    .replace(/\s+/g, " ")
    .trim();

  if (name.length < 4 || name.length > 90) return null;
  if (name.startsWith("#")) return null;
  if (LISTING_JUNK.test(name)) return null;
  if (GENERIC_JUNK.test(name)) return null;
  if (WEEKDAYS.test(name)) return null;
  if (REGISTRY_JUNK.test(name)) return null;
  if (PLACEMENT_JUNK.test(name)) return null;
  if (TIME_JUNK.test(name)) return null;
  if (CIN_PATTERN.test(name)) return null;
  if (/^\d{4,}/.test(name)) return null;
  if (/justdial|indiamart|zauba|tradeindia|sulekha/i.test(name)) return null;
  if (/^[\d\s·•,.-]+$/.test(name)) return null;
  if (/^(bangalore|bengaluru|hosur|mysore|india)$/i.test(name)) return null;
  if (/offers placement consultants/i.test(name)) return null;
  if (/gift dealers?|gift hampers?|gift box dealers?|gift shop/i.test(name)) return null;
  if (/;\s*U\d/.test(name)) return null;
  return name;
}

const CATEGORY_PAGE =
  /\/(corporate-companies|companies-for-|business-directory|near-)/i;

function slugToCompanyName(slug: string): string | null {
  const name = slug
    .replace(/-near-.*$/i, "")
    .replace(/-in-.*$/i, "")
    .replace(/-+/g, " ")
    .replace(/\b(pvt|ltd|llp|inc|corp)\b/gi, (m) => m.toUpperCase())
    .replace(/\s+/g, " ")
    .trim();
  return cleanCompanyName(name);
}

function extractFromJustDialUrl(url: string): string | null {
  try {
    const { pathname } = new URL(url);
    if (!/justdial\.com/i.test(url)) return null;
    const segments = pathname.split("/").filter(Boolean);
    if (segments.length < 2) return null;
    const slug = segments[1];
    if (!slug || CATEGORY_PAGE.test(`/${slug}/`) || /^nct-/i.test(slug)) return null;
    return slugToCompanyName(slug);
  } catch {
    return null;
  }
}

function extractFromContent(content: string): string[] {
  const normalized = content
    .replace(/^Popular[^·]*·\s*/i, "")
    .replace(/^Corporate Companies in [^·]+ – [^·]+ ·\s*/i, "")
    .trim();

  const parts = normalized.includes(" · ")
    ? normalized.split(/\s·\s/)
    : normalized.split(/[·•|]+/);

  return parts
    .flatMap((part) => part.split(/,(?=\s*[A-Z])/))
    .map((s) => s.replace(/\.$/, "").trim())
    .filter(Boolean);
}

/** Heuristic fallback when LLM extraction is unavailable or returns nothing. */
export function parseCompaniesFromDirectoryResults(
  hits: DirectoryHit[],
  cities: string[],
  limit: number,
): ScoutCompanyResult[] {
  const out: ScoutCompanyResult[] = [];
  const seen = new Set<string>();

  for (const hit of hits) {
    const fromUrl = extractFromJustDialUrl(hit.url);
    const candidates = [
      ...(fromUrl ? [fromUrl] : []),
      ...extractFromContent(hit.content),
    ];
    const industry = inferIndustryFromTitle(hit.title);
    const city = inferCityFromHit(hit, cities);
    let host = "directory";
    try {
      host = new URL(hit.url).hostname.replace(/^www\./, "");
    } catch {
      // ignore bad URLs
    }

    for (const raw of candidates) {
      const name = cleanCompanyName(raw);
      if (!name) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      const companyCity = inferCityFromSegment(raw, cities) ?? city;

      out.push({
        name,
        city: companyCity,
        industry,
        intelNotes: `Directory listing (${host}) — verify before outreach`,
        giftScore: 62,
        dataSource: "india_directories_heuristic",
      });

      if (out.length >= limit) return out;
    }
  }

  return out;
}

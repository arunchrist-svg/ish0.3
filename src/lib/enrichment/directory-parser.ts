import type { ScoutCompanyResult } from "./types";
import { expandCitySearchTerms } from "./city-search";
import {
  isCityInLocalityPhrase,
  isGeographicEntity,
  isGluedOrStatePlaceName,
  stripLeadingMetroFromName,
} from "./company-name-match";
import { isBroadGeoLabel } from "@/lib/geo/india";
import { extractEmployeesFromText } from "./employee-size";

type DirectoryHit = { title: string; url: string; content: string };

const WEEKDAYS = /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/i;
const REGISTRY_JUNK = /^(active|strike off|all of the companies listed|companies incorpated)/i;
const PLACEMENT_JUNK = /^placement consultancy for /i;
const TIME_JUNK = /\d\s*(am|pm)/i;
const CIN_PATTERN = /\bU\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}\b/i;

const LISTING_JUNK =
  /^(top|popular|corporate companies|leading businesses|professional services|name|page \d|find business|near |in |the hudson$)/i;
const GENERIC_JUNK =
  /^(star office|softinu|sandyrtr|embassy icon|newtimes group|vdrone|cuem \(head office\)|careers?|jobs?|hiring|about|home|contact|blog|news|press)$/i;

const FORM_OR_CATALOG_LABEL =
  /^(quotations?|contact\s*(number|no\.?|info|details?|us)?|phone(\s*number)?|mobile(\s*number)?|fax|toll[\s-]?free|enquiry|inquiry|get\s+a?\s*quote|request\s+quote|price\s*list|catalogue|catalog|n\/?a|nil|none|bank|shipping\s+lines?|canteen)$/i;

const GENERIC_FRAGMENT_JUNK =
  /\b(canteen|shipping\s+lines?|,?\s*etc\.?\b)\b/i;

const ADMIN_UNIT_PLACE =
  /\b(hobli|taluk|taluka|tehsil|mandal|panchayat|municipality)\b|taluk$|hobli$/i;

const JOB_OR_DEGREE_JUNK =
  /\b(jobs?|openings?|vacancies|hiring|careers?)\s*$/i;

const DEGREE_FRAGMENT =
  /^(be|b\.?e\.?|btech|b\.?tech\.?|mtech|mba|bsc|msc)\s+(mech|mechanical|civil|ece|cse|it|eee)\b/i;

/** AmbitionBox / Glassdoor section headings that are not company names. */
const PAGE_SECTION_NAME =
  /^(work satisfaction|company culture|salary|salaries|reviews?|interviews?|benefits|work[\s-]?life[\s-]?balance|job security|skill development|promotions?|ratings?|overview|photos?|q\s*&\s*a|interview questions|jobs?|compare|similar companies|competitors?|awards?|perks?|office|locations?|diversity|inclusion|management|leadership|compensation|ctc|package|bonus|happiness|work happiness|job satisfaction|company reviews?|employee reviews?|about us|why join|life at|work policy|legal name|founded|headquarters|website|industry)$/i;

const REVIEW_HOST =
  /ambitionbox|glassdoor|comparably|levels\.fyi|teamblind|mouthshut|in\.indeed|naukri\.com|cutshort|instahyre/i;

/** Page titles / snippets that are clearly not company names. */
const NON_COMPANY_NAME =
  /\b(is hiring|are hiring|we'?re hiring|now hiring|view \d+\s*jobs|jobs? at |careers? at |this document|list of compan|company addresses|in \d{4}\b|hiring for|open roles|job openings?|apply now|read more|click here)\b/i;

const SENTENCE_STARTERS =
  /^(this|these|that|those|here|there|it|we|our|the following|a list|an overview|welcome|about|how to|what is|why |when |where )\b/i;

const COMPANY_SUFFIX =
  /\b(ltd|limited|pvt|private|llp|inc|corp|corporation|plc|gmbh|llc|co\.?|company|group|technologies|technology|systems|solutions|labs?|software|networks?|ventures?)\b/i;

/** Strong legal / industry markers that keep a name even if a place word appears (e.g. "… Pvt Ltd Sipcot"). */
const STRONG_COMPANY_MARKER =
  /\b(ltd|limited|pvt\.?\s*ltd\.?|private\s+limited|llp|inc|corp|corporation|plc|gmbh|llc|technologies|technology|systems|solutions|electronics|automobiles?|components?|industries|manufactur(?:ing|ers?)?|motors?|textiles?|pharma(?:ceuticals?)?|chemicals?|engineering|services)\b/i;

/** Addresses, estates, roads, layouts, PIN codes mistaken for companies. */
const ADDRESS_OR_PLACE_NAME =
  /\b(sipcot|sidco|midc|gidc|rieco|ricco|riico|sez|epip|indl\.?|industrial\s+(area|estate|complex|park|zone|township)|phase[- ]*[ivx\d]+|plot\s*no\.?|survey\s*no\.?|door\s*no\.?|shed\s*no\.?|unit\s*no\.?|shop\s*no\.?|flat\s*no\.?|sector\s*\d+|block\s*[a-z0-9]|[a-z]\s+block|agraharam|village|taluk|taluka|hobli|district|pincode|pin\s*code|postal\s*code|layout|colony|extension|extn\.?|nagar|compound|bypass|highway|main\s+road|\brd\.?\b|\broad\b|\bstreet\b|\bcross\b|\bpost\b|\bestate\b|\barea\b|\bcomplex\b|\bpark\b|\bzone\b|\bphase\b)\b/i;

const BUILDING_BLOCK =
  /\b(?:[a-z]\s+block|block\s*[a-z0-9]|tower[\s-]*[a-z0-9]?|wing\s*[a-z0-9]?)\b/i;

const FLOOR_OR_LEVEL =
  /\b(\d+(st|nd|rd|th)\s+floor|floor\s*\d+|level\s*\d+|basement|mezzanine)\b/i;

const BUILDING_OR_PARK =
  /\b(building|biulding|tower|technostar|tech\s*park|it\s*park|sezs?|campus)\b/i;

const TITLE_PREFIX = /^title\s*:\s*/i;

const LEGAL_ENTITY_TAIL =
  /^(.+?\b(?:pvt\.?\s*ltd\.?|private\s+limited|ltd\.?|limited|llp|inc\.?|corp(?:oration)?)\b)\s+(.+)$/i;

const TRAILING_IN_PLACE = /\s+in\s+[A-Za-z][A-Za-z\s.-]{2,40}$/i;

const PIN_OR_PLOT_SHAPE =
  /\b\d{6}\b|^\s*[A-Za-z][A-Za-z\s.-]{2,30}[\s-]*\d{5,6}\s*$|^\s*[A-Za-z]+\s*(no\.?\s*)?\d{1,4}[A-Za-z]?\s*$|^\s*[A-Za-z]+\d{1,4}\/\d*[A-Za-z]*\s*$|\bno\.?\s*\d{1,4}\b/i;

const PLACE_NAME_SUFFIX =
  /(palli|halli|puram|pet|kere|nagar|layout|colony|road|rd|estate|compound|post|area|complex|park|zone|village)$/i;

const REGISTRY_OR_FORM_FIELD =
  /^(company\s+(subcategory|class|category|status|type|name)|indian non-government company|private company|public company|one person company|email id|e-?mail|address|tax|cin|din|roc(\s+code)?|directors?|charges?)$/i;

const REGISTRY_FIELD_PHRASE =
  /\b(filing status|status under cirp|authorised capital|paid[- ]?up capital|date of incorporation|company subcategory|company class)\b/i;

const PRODUCT_LISTING =
  /\b(inr|rs\.?)\b|\bapprox\.?\b|₹|\bname\s*plates?\b|\bsign\s*plates?\b|\bair\s*purifiers?\b|\bwater\s*pumping\b|\bsolar\s+water\b|\bled\s+name\b|\bz\s*clamp\b|\bdtf\s+air\b|\bnegative\s+pressure\s+hood\b|\btoxic\s+gas\s+removal\b/i;

const PRODUCT_SPEC =
  /\b\d+(\.\d+)?\s*(mm|cm|hp|kw|kg|ml|ltr|litre|inch|ft)\b/i;

function looksLikeNicOrShellName(name: string): boolean {
  if (/\b(computer|software|business|manufacturing)\s+and\s+related\s+activities\b/i.test(name)) {
    return true;
  }
  if (/^(manufacture|trading|wholesale|retail)\s+of\b/i.test(name)) return true;
  if (/^(private\s+)?limited\b/i.test(name)) {
    const rest = name.replace(/^(private\s+)?limited\b/i, "").trim();
    if (!rest) return true;
    if (
      /^(technologies|technology|systems|solutions|services|company|computer|software|business)\b/i.test(
        rest,
      )
    ) {
      return true;
    }
  }
  return false;
}

function looksLikeProductOrField(name: string): boolean {
  const hasLegalEntity = /\b(ltd|limited|pvt|private|llp|inc|corp|corporation|plc|gmbh|llc)\b/i.test(name);
  if (REGISTRY_OR_FORM_FIELD.test(name) || REGISTRY_FIELD_PHRASE.test(name)) return true;
  if (looksLikeNicOrShellName(name)) return true;
  if (PRODUCT_LISTING.test(name) && !hasLegalEntity) return true;
  if (PRODUCT_SPEC.test(name) && !hasLegalEntity) return true;
  if (/^\d/.test(name) && !hasLegalEntity && !/^[0-9][a-z]/i.test(name)) return true;
  return false;
}

function looksLikeAddressOrPlace(name: string): boolean {
  const words = name.split(/[\s,/]+/).filter(Boolean);
  const hasStrongCompany = STRONG_COMPANY_MARKER.test(name);
  const hasLegalEntity = /\b(ltd|limited|pvt|private|llp|inc|corp|corporation|plc|gmbh|llc)\b/i.test(name);

  if (BUILDING_BLOCK.test(name) && !hasStrongCompany) return true;
  if (FLOOR_OR_LEVEL.test(name) && !hasLegalEntity) return true;
  if (BUILDING_OR_PARK.test(name) && !hasLegalEntity) return true;
  if (isGluedOrStatePlaceName(name)) return true;
  if (ADMIN_UNIT_PLACE.test(name) && !hasLegalEntity) return true;

  // PHASE-I / Phase II / Phase 1
  if (/^phase[- ]*[ivx\d]+$/i.test(name.trim())) return true;

  // "HOSUR TO THALLY ROAD"
  if (/\bto\b.+\b(road|rd)\b/i.test(name)) return true;

  if (ADDRESS_OR_PLACE_NAME.test(name) && !hasStrongCompany) return true;
  if (PIN_OR_PLOT_SHAPE.test(name) && !hasStrongCompany) return true;

  // City glued to plot / pin: "HosurPlot No 63", "Hosur-635126", "Hosur20/2d"
  if (
    /^[A-Za-z]{3,}[\s-]?(plot|phase|sector|no\.?|door|shed)?[\s-]?\d/i.test(name) &&
    !hasStrongCompany
  ) {
    return true;
  }

  // Bare estate labels
  if (/^(industrial|corporate|business)\s+(area|estate|complex|park|zone)$/i.test(name)) return true;

  // Ends with place vocabulary and no strong company marker
  if (PLACE_NAME_SUFFIX.test(name.replace(/[.\s]+$/g, "")) && !hasStrongCompany) return true;

  // Single-token Indian locality-style names (Hanumapalli, KARNOOR)
  if (words.length === 1) {
    const token = words[0].replace(/[.-]/g, "");
    if (PLACE_NAME_SUFFIX.test(token)) return true;
    if (/(oor|alli|palli|halli|puram|pet|kere)$/i.test(token) && token.length >= 6 && !hasStrongCompany) {
      return true;
    }
  }

  // Multi-word ALL CAPS place lines without a real company marker
  if (
    !hasStrongCompany &&
    words.length >= 2 &&
    words.length <= 6 &&
    words.every((w) => /^[A-Z0-9][A-Z0-9.&'-]*$/.test(w)) &&
    ADDRESS_OR_PLACE_NAME.test(name)
  ) {
    return true;
  }

  return false;
}

function inferIndustryFromTitle(title: string): string | undefined {
  const t = title.toLowerCase();
  if (t.includes(" for it") || t.includes("technology") || t.includes(" software")) return "IT";
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
  const hits: string[] = [];
  for (const city of cities) {
    for (const term of expandCitySearchTerms([city])) {
      if (term.length >= 3 && lower.includes(term.toLowerCase())) hits.push(term);
    }
  }
  if (!hits.length) return undefined;
  const specific = hits.filter((term) => !isBroadGeoLabel(term));
  const pool = specific.length ? specific : hits;
  return [...pool].sort((a, b) => b.length - a.length)[0];
}

function inferCityFromSegment(segment: string, cities: string[]): string | undefined {
  return inferCityFromText(segment.replace(/-/g, " "), cities);
}

/** Pull city from URL path segments (e.g. justdial.com/Hosur/...) or -in-city slugs. */
function inferCityFromUrl(url: string, cities: string[]): string | undefined {
  try {
    const { pathname } = new URL(url);
    const segments = pathname.split("/").filter(Boolean);
    for (const segment of segments) {
      const fromSegment = inferCityFromText(segment.replace(/-/g, " "), cities);
      if (fromSegment) return fromSegment;
    }
    const inCity = pathname.match(/(?:^|[/-])in-([a-z][a-z-]+)/i);
    if (inCity?.[1]) {
      const fromSlug = inferCityFromText(inCity[1].replace(/-/g, " "), cities);
      if (fromSlug) return fromSlug;
    }
  } catch {
    // ignore bad URLs
  }
  return undefined;
}

function inferCityFromHit(hit: DirectoryHit, cities: string[]): string | undefined {
  const fromUrl = inferCityFromUrl(hit.url, cities);
  if (LISTING_TITLE.test(hit.title) || isListingUrl(hit.url)) {
    return fromUrl;
  }
  return fromUrl ?? inferCityFromText(`${hit.content} ${hit.url}`, cities);
}

/**
 * Reject job posts, document blurbs, and other non-company strings that
 * directory / Tavily heuristics often treat as names.
 */
export function isPlausibleCompanyName(raw: string): boolean {
  return cleanCompanyName(raw) !== null;
}

export function withCleanedCompanyName<T extends { name: string }>(item: T): T | null {
  const name = cleanCompanyName(item.name);
  if (!name) return null;
  return name === item.name ? item : { ...item, name };
}

/** Prefer legal entities when LLM filter is unavailable (directory fallback mode). */
export function looksLikeStrictCompanyName(raw: string): boolean {
  const name = cleanCompanyName(raw);
  if (!name) return false;
  return /\b(ltd|limited|pvt|private|llp|inc|corp|corporation|plc|gmbh|llc)\b/i.test(name);
}

export function keepStrictCompaniesOnly<T extends { name: string }>(companies: T[]): T[] {
  return companies
    .map(withCleanedCompanyName)
    .filter((c): c is T => c != null && looksLikeStrictCompanyName(c.name));
}

/** Strip "Title:" and trailing address after a legal entity (… Pvt Ltd Industrial Area). */
function normalizeScrapedCompanyName(raw: string): string {
  let name = raw.replace(TITLE_PREFIX, "").trim();
  const legal = name.match(LEGAL_ENTITY_TAIL);
  if (legal) {
    const brand = legal[1].trim();
    const tail = legal[2].trim();
    if (
      looksLikeAddressOrPlace(tail) ||
      ADDRESS_OR_PLACE_NAME.test(tail) ||
      FLOOR_OR_LEVEL.test(tail) ||
      BUILDING_OR_PARK.test(tail) ||
      isGeographicEntity(tail) ||
      /\b(industrial|area|circle|layout|nagar|floor|level|tower|building|hobli)\b/i.test(tail)
    ) {
      name = brand;
    }
  }
  if (LEGAL_ENTITY_TAIL.test(name) === false && TRAILING_IN_PLACE.test(name)) {
    const withoutPlace = name.replace(TRAILING_IN_PLACE, "").trim();
    if (/\b(ltd|limited|pvt|llp|inc|corp)\b/i.test(withoutPlace)) {
      name = withoutPlace;
    }
  }
  return name.replace(/\s+/g, " ").trim();
}

export function cleanCompanyName(raw: string): string | null {
  const name = normalizeScrapedCompanyName(
    raw
      .replace(/\(\s*corporate office\s*\)/gi, "(Corporate Office)")
      .replace(/\(\s*head office\s*\)/gi, "(Head Office)")
      .replace(/\(\s*regional office\s*\)/gi, "(Regional Office)")
      .replace(/[#!*|]+/g, " ")
      .replace(/\s+/g, " ")
      .replace(/\.{2,}$/g, "")
      .trim(),
  );

  if (name.length < 2 || name.length > 70) return null;
  if (name.startsWith("#")) return null;
  if (isCityInLocalityPhrase(name)) return null;
  const strippedMetro = stripLeadingMetroFromName(name);
  if (strippedMetro && strippedMetro !== name) return cleanCompanyName(strippedMetro);
  if (LISTING_JUNK.test(name)) return null;
  if (GENERIC_JUNK.test(name)) return null;
  if (FORM_OR_CATALOG_LABEL.test(name)) return null;
  if (GENERIC_FRAGMENT_JUNK.test(name) && !STRONG_COMPANY_MARKER.test(name)) return null;
  if (JOB_OR_DEGREE_JUNK.test(name)) return null;
  if (DEGREE_FRAGMENT.test(name)) return null;
  if (PAGE_SECTION_NAME.test(name)) return null;
  if (WEEKDAYS.test(name)) return null;
  if (REGISTRY_JUNK.test(name)) return null;
  if (PLACEMENT_JUNK.test(name)) return null;
  if (TIME_JUNK.test(name)) return null;
  if (CIN_PATTERN.test(name)) return null;
  if (/^\d{4,}/.test(name)) return null;
  if (/justdial|indiamart|zauba|tradeindia|sulekha|linkedin|glassdoor|indeed/i.test(name)) return null;
  if (/^[\d\s·•,.-]+$/.test(name)) return null;
  if (isGeographicEntity(name)) return null;
  if (looksLikeAddressOrPlace(name)) return null;
  if (looksLikeProductOrField(name)) return null;
  if (LISTING_TITLE.test(name)) return null;
  if (/^(companies|businesses|firms|offices)\s+in\b/i.test(name)) return null;
  if (/\bincluding\b/i.test(name)) return null;
  if (/offers placement consultants/i.test(name)) return null;
  if (/;\s*U\d/.test(name)) return null;

  if (NON_COMPANY_NAME.test(name)) return null;
  if (SENTENCE_STARTERS.test(name)) return null;
  if (/\?$/.test(name)) return null;
  if (/^\d+\s+(jobs?|companies|results?)\b/i.test(name)) return null;
  if (/^(view|browse|see|find|search|explore|discover)\b/i.test(name)) return null;

  // Full sentences / multi-clause blurbs
  if ((name.match(/\./g) ?? []).length >= 1 && name.split(/\s+/).length > 4) return null;
  if (/,.*,/.test(name) && !COMPANY_SUFFIX.test(name)) return null;

  const words = name.split(/\s+/).filter(Boolean);
  if (words.length > 6 && !COMPANY_SUFFIX.test(name)) return null;
  if (words.length >= 4 && !COMPANY_SUFFIX.test(name) && !/^[A-Z0-9]/.test(name)) return null;

  // "India in 2026", "Tech in 2025" style report titles
  if (/^[A-Za-z\s]+ in 20\d{2}$/i.test(name)) return null;

  // Mostly lowercase prose (company names are usually Title Case / brand-like)
  const letters = name.replace(/[^A-Za-z]/g, "");
  if (letters.length >= 12) {
    const lower = (letters.match(/[a-z]/g) ?? []).length;
    if (lower / letters.length > 0.85 && words.length >= 4) return null;
  }

  return name;
}

/** Brand-like token: Capitalized / alphanumeric, no sentence punctuation. */
const BRAND_TOKEN = "[A-Z0-9][A-Za-z0-9&']*(?:[.&][A-Za-z0-9&']+)?";
const BRAND_NAME = `(${BRAND_TOKEN}(?:\\s+${BRAND_TOKEN}){0,4})`;

/** Pull a real company name out of job-board / article titles when possible. */
function extractCompanyFromTitle(title: string): string | null {
  const patterns = [
    new RegExp(`\\b${BRAND_NAME}\\s+is\\s+hiring\\b`, "i"),
    new RegExp(`\\b(?:jobs?|careers?)\\s+at\\s+${BRAND_NAME}\\b`, "i"),
    new RegExp(`#+\\s*${BRAND_NAME}\\s*$`),
    new RegExp(`^${BRAND_NAME}\\s*[-|–—:]\\s*(?:careers?|jobs?|hiring|linkedin)`, "i"),
  ];

  for (const pattern of patterns) {
    const match = title.match(pattern);
    if (match?.[1]) {
      const cleaned = cleanCompanyName(match[1]);
      if (cleaned) return cleaned;
    }
  }

  // Bare title that already looks like a company (e.g. "SingleStore", "Forward Networks")
  const head = title
    .split(/\s*[|–—]\s*/)[0]
    ?.replace(/\s+-\s+(?:company|cin|directors?|overview|profile)\b.*$/i, "")
    .trim() ?? "";
  return cleanCompanyName(head);
}

const CATEGORY_PAGE =
  /\/(corporate-companies|companies-for-|business-directory|near-)/i;

function slugToCompanyName(slug: string): string | null {
  const name = slug
    .replace(/-near-.*$/i, "")
    .replace(/-in-.*$/i, "")
    .replace(/-+/g, " ")
    .replace(/\b([a-z])/g, (letter) => letter.toUpperCase())
    .replace(/\b(pvt|ltd|llp|inc|corp)\b/gi, (m) => m.toUpperCase())
    .replace(/\s+/g, " ")
    .trim();
  return cleanCompanyName(name);
}

const REGISTRY_HOST =
  /zaubacorp\.com|zauba\.com|tofler\.in|thecompanycheck\.com|instafinancials\.com/i;

/** Zauba / Tofler company page slugs are legal names (…/company/INFOSYS-LIMITED/CIN). */
export function extractFromRegistryUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!REGISTRY_HOST.test(parsed.hostname)) return null;
    const match = parsed.pathname.match(
      /\/(?:company|organisation|organization)\/([A-Za-z0-9][A-Za-z0-9-]{2,90})(?:\/[A-Z0-9]+)?/i,
    );
    const slug = match?.[1];
    if (!slug || /^(search|directors|list|companies|company|cin)$/i.test(slug)) return null;
    const name = slug
      .replace(/-cin-.*$/i, "")
      .replace(/-+/g, " ")
      .replace(/\b([a-z])/g, (letter) => letter.toUpperCase())
      .replace(/\b(pvt|ltd|llp|inc|corp)\b/gi, (m) => m.toUpperCase())
      .replace(/\s+/g, " ")
      .trim();
    return cleanCompanyName(name);
  } catch {
    return null;
  }
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

function isReviewHost(urlOrHost: string): boolean {
  return REVIEW_HOST.test(urlOrHost);
}

function extractFromReviewSiteUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!isReviewHost(parsed.hostname)) return null;
    const path = parsed.pathname;
    const patterns = [
      /\/overview\/([a-z0-9-]+)-reviews?/i,
      /\/reviews\/([a-z0-9-]+)/i,
      /\/working-at-([a-z0-9-]+)/i,
      /\/company\/([a-z0-9-]+)/i,
      /\/companies\/([a-z0-9-]+)/i,
    ];
    for (const pattern of patterns) {
      const match = path.match(pattern);
      if (match?.[1]) {
        const slug = match[1].replace(/-ei-.*$/i, "").replace(/-reviews?$/i, "");
        return slugToCompanyName(slug);
      }
    }
  } catch {
    // ignore bad URLs
  }
  return null;
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

  const push = (
    raw: string,
    industry: string | undefined,
    city: string | undefined,
    host: string,
    employees?: string,
  ) => {
    const name = cleanCompanyName(raw);
    if (!name) return;
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);

    const registry = REGISTRY_HOST.test(host);
    out.push({
      name,
      city: inferCityFromSegment(raw, cities) ?? city,
      industry,
      employees: employees ?? extractEmployeesFromText(raw),
      intelNotes: registry
        ? `MCA / Zauba listing (${host})`
        : `Directory listing (${host}) — verify before outreach`,
      fitScore: registry ? 76 : 62,
      dataSource: "india_directories_heuristic",
    });
  };

  const rankedHits = [...hits].sort((a, b) => {
    const score = (url: string) => (REGISTRY_HOST.test(url) ? 0 : 1);
    return score(a.url) - score(b.url);
  });

  for (const hit of rankedHits) {
    const reviewHost = isReviewHost(hit.url);
    const fromUrl =
      extractFromRegistryUrl(hit.url) ??
      extractFromJustDialUrl(hit.url) ??
      extractFromReviewSiteUrl(hit.url);
    const fromTitle = reviewHost ? null : extractCompanyFromTitle(hit.title);
    const candidates = [
      ...(fromUrl ? [fromUrl] : []),
      ...(fromTitle ? [fromTitle] : []),
      ...(reviewHost ? [] : extractFromContent(hit.content)),
    ];
    const industry = inferIndustryFromTitle(hit.title);
    const city = inferCityFromHit(hit, cities);
    const employees = extractEmployeesFromText(`${hit.title} ${hit.content}`);
    let host = "directory";
    try {
      host = new URL(hit.url).hostname.replace(/^www\./, "");
    } catch {
      // ignore bad URLs
    }

    for (const raw of candidates) {
      push(raw, industry, city, host, employees);
      if (out.length >= limit) return out;
    }
  }

  return out;
}

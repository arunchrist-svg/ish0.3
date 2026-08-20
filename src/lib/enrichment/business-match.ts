/**
 * Keep scout companies that match selected Businesses chips (Schools, Banks, etc).
 * Business mode previously skipped vertical filtering, so food shops could land
 * in a Schools/Colleges result set.
 */
import type { ScoutBusiness } from "@/lib/scouting-data";
import { SCOUT_BUSINESSES } from "@/lib/scouting-data";

type BusinessMatcher = {
  /** Positive name / industry signals for this establishment type. */
  keep: RegExp;
  /** Hard reject when the name is clearly a different category. */
  reject?: RegExp;
  industries?: string[];
};

const FOOD_OR_RETAIL_RE =
  /\b(restaurant|cafe|bakery|mithai|sweet|pizza|burger|roll|kati|bar|pub|dhaba|hotel|motel|resort|shop|store|mart|market|pharmacy|clinic)\b/i;

const BUSINESS_MATCHERS: Record<ScoutBusiness, BusinessMatcher> = {
  Banks: {
    keep: /\b(bank|banking|co[- ]?operative bank|grameen|sbi|hdfc|icici|axis|canara|pnb|bob)\b/i,
    reject: /\b(school|college|university|hospital|hotel|restaurant)\b/i,
    industries: ["BFSI", "Financial Services", "Finance"],
  },
  Schools: {
    keep: /\b(school|vidyalaya|vidya\s*mandir|academy|kendriya|navodaya|high\s*school|primary|secondary|kindergarten|playschool|montessori)\b/i,
    reject: FOOD_OR_RETAIL_RE,
    industries: ["Education"],
  },
  Colleges: {
    keep: /\b(college|polytechnic|junior\s*college|degree\s*college|engineering\s*college|medical\s*college)\b/i,
    reject: FOOD_OR_RETAIL_RE,
    industries: ["Education"],
  },
  Universities: {
    keep: /\b(university|universities|\biit\b|\biim\b|\bnit\b|deemed\s*university|campus)\b/i,
    reject: FOOD_OR_RETAIL_RE,
    industries: ["Education"],
  },
  Hospitals: {
    keep: /\b(hospital|hospitals|medical\s*centre|medical\s*center|nursing\s*home|multispecialty|multispeciality|super\s*specialty|super\s*speciality|clinic)\b/i,
    reject: /\b(school|college|university|bank|restaurant|hotel|roll)\b/i,
    industries: ["Healthcare", "Pharma"],
  },
  Hotels: {
    keep: /\b(hotel|hotels|resort|resorts|lodging|inn|guest\s*house|serviced\s*apartment)\b/i,
    reject: /\b(school|college|university|bank|hospital|kati\s*roll)\b/i,
    industries: ["Hospitality"],
  },
  "Government offices": {
    keep: /\b(government|govt\.?|municipal|corporation|collectorate|secretariat|taluk|tehsil|panchayat|court|police\s*station|post\s*office)\b/i,
    reject: FOOD_OR_RETAIL_RE,
  },
  Clubs: {
    keep: /\b(club|clubs|gymkhana|sports\s*club|recreation)\b/i,
    reject: FOOD_OR_RETAIL_RE,
  },
  "Housing societies": {
    keep: /\b(society|societies|apartment|apartments|residency|residential|housing|township|layout)\b/i,
    reject: FOOD_OR_RETAIL_RE,
  },
  Hostels: {
    keep: /\b(hostel|hostels|pg\b|paying\s*guest|dormitory)\b/i,
    reject: /\b(school|college|university|bank|hospital|restaurant|kati\s*roll)\b/i,
    industries: ["Hospitality", "Education"],
  },
};

/** Google Places types that belong to each scout business chip. */
export const BUSINESS_PLACE_TYPES: Partial<Record<ScoutBusiness, string[]>> = {
  Banks: ["bank", "atm", "finance"],
  Schools: ["school", "primary_school", "secondary_school"],
  Colleges: ["university", "school"],
  Universities: ["university"],
  Hospitals: ["hospital", "doctor", "dentist", "physiotherapist", "medical_lab"],
  Hotels: ["lodging"],
  "Government offices": ["local_government_office", "courthouse", "city_hall", "police"],
  Hostels: ["lodging"],
};

/** Types that must never pass an education / bank / hospital business search. */
const CONFLICTING_PLACE_TYPES = new Set([
  "restaurant",
  "cafe",
  "bakery",
  "meal_takeaway",
  "meal_delivery",
  "bar",
  "night_club",
  "food",
  "liquor_store",
  "shopping_mall",
  "clothing_store",
  "supermarket",
  "convenience_store",
]);

function matcherForLabel(label: string): BusinessMatcher | null {
  if ((SCOUT_BUSINESSES as readonly string[]).includes(label)) {
    return BUSINESS_MATCHERS[label as ScoutBusiness] ?? null;
  }
  return null;
}

export function companyMatchesScoutBusiness(
  company: { name: string; industry?: string | null },
  businessLabel: string,
): boolean {
  const matcher = matcherForLabel(businessLabel);
  if (!matcher) return true;

  const name = company.name ?? "";
  if (matcher.reject?.test(name)) return false;

  if (matcher.keep.test(name)) return true;

  const industry = company.industry?.trim();
  if (industry && matcher.industries?.some((i) => i.toLowerCase() === industry.toLowerCase())) {
    // Industry alone is weak (Hospitality covers hotels and restaurants). Require a keep signal
    // unless the industry is Education/BFSI/Healthcare which are tighter.
    if (/^(Education|BFSI|Financial Services|Finance|Healthcare|Pharma)$/i.test(industry)) {
      return true;
    }
  }

  return false;
}

export function companyMatchesAnyScoutBusiness(
  company: { name: string; industry?: string | null },
  businesses: string[],
): boolean {
  const labels = businesses.map((b) => b.trim()).filter(Boolean);
  if (!labels.length) return true;
  return labels.some((label) => companyMatchesScoutBusiness(company, label));
}

export function filterBySelectedBusinesses<T extends { name: string; industry?: string | null }>(
  results: T[],
  businesses: string[],
): T[] {
  if (!businesses.length) return results;
  return results.filter((c) => companyMatchesAnyScoutBusiness(c, businesses));
}

/** Drop Google Places hits whose types conflict with the requested business chip. */
export function placeTypesMatchScoutBusiness(
  types: string[] | undefined,
  businessLabel: string,
): boolean {
  const list = types ?? [];
  if (!list.length) return true;

  if (list.some((t) => CONFLICTING_PLACE_TYPES.has(t))) {
    const allowed = BUSINESS_PLACE_TYPES[businessLabel as ScoutBusiness];
    // Food/retail types always lose for non-food businesses.
    if (!allowed?.some((t) => list.includes(t))) return false;
  }

  const allowed = BUSINESS_PLACE_TYPES[businessLabel as ScoutBusiness];
  if (!allowed?.length) return true;
  if (list.some((t) => allowed.includes(t))) return true;
  // establishment / point_of_interest alone: defer to name filter downstream
  if (list.every((t) => t === "establishment" || t === "point_of_interest" || t === "geocode")) {
    return true;
  }
  return false;
}

import type { ScoutCompanyResult } from "./types";

const NEW_API = "https://places.googleapis.com/v1/places:searchText";
const LEGACY_BASE = "https://maps.googleapis.com/maps/api/place";

type PlacesResult = {
  place_id: string;
  name: string;
  formatted_address?: string;
  website?: string;
  formatted_phone_number?: string;
  rating?: number;
  user_ratings_total?: number;
  types?: string[];
  business_status?: string;
};

type NewPlace = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  websiteUri?: string;
  nationalPhoneNumber?: string;
  rating?: number;
  userRatingCount?: number;
  types?: string[];
  businessStatus?: string;
};

function apiKey(): string {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) throw new Error("GOOGLE_PLACES_API_KEY not set");
  return key;
}

function mapNewPlace(place: NewPlace): PlacesResult {
  return {
    place_id: place.id ?? "",
    name: place.displayName?.text ?? "Unknown",
    formatted_address: place.formattedAddress,
    website: place.websiteUri,
    formatted_phone_number: place.nationalPhoneNumber,
    rating: place.rating,
    user_ratings_total: place.userRatingCount,
    types: place.types,
    business_status: place.businessStatus,
  };
}

async function placesTextSearchNew(query: string): Promise<PlacesResult[]> {
  const res = await fetch(NEW_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey(),
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.formattedAddress,places.websiteUri,places.nationalPhoneNumber,places.rating,places.userRatingCount,places.types,places.businessStatus",
    },
    body: JSON.stringify({
      textQuery: query,
      regionCode: "IN",
      languageCode: "en",
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.error?.message ?? `Google Places (New) failed: ${res.status}`;
    throw new Error(msg);
  }

  return ((data.places as NewPlace[] | undefined) ?? []).map(mapNewPlace);
}

async function placesTextSearchLegacy(query: string): Promise<PlacesResult[]> {
  const url = `${LEGACY_BASE}/textsearch/json?query=${encodeURIComponent(query)}&region=in&language=en&key=${apiKey()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Google Places text search failed: ${res.status}`);
  const data = await res.json();
  if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
    throw new Error(`Google Places error: ${data.status} — ${data.error_message ?? ""}`);
  }
  return data.results ?? [];
}

async function placeDetailsLegacy(placeId: string): Promise<PlacesResult> {
  const fields = "name,formatted_address,website,formatted_phone_number,rating,user_ratings_total,types,business_status";
  const url = `${LEGACY_BASE}/details/json?place_id=${placeId}&fields=${fields}&key=${apiKey()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Google Places details failed: ${res.status}`);
  const data = await res.json();
  return data.result ?? {};
}

async function placesTextSearch(query: string): Promise<PlacesResult[]> {
  try {
    return await placesTextSearchNew(query);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/legacy|not enabled|REQUEST_DENIED/i.test(msg)) {
      return placesTextSearchLegacy(query);
    }
    throw e;
  }
}

function extractCityFromAddress(address?: string): string | undefined {
  if (!address) return undefined;
  const parts = address.split(",").map((p) => p.trim());
  const KNOWN_CITIES = ["Bangalore", "Bengaluru", "Hosur", "Mysore", "Mysuru", "Pune", "Chennai", "Mumbai", "Delhi", "Hyderabad"];
  for (const part of parts) {
    const match = KNOWN_CITIES.find((c) => part.toLowerCase().includes(c.toLowerCase()));
    if (match) return match === "Bengaluru" ? "Bangalore" : match === "Mysuru" ? "Mysore" : match;
  }
  return parts.length >= 3 ? parts[parts.length - 3] : undefined;
}

function inferIndustry(types?: string[]): string | undefined {
  if (!types?.length) return undefined;
  const MAP: Record<string, string> = {
    store: "Retail",
    clothing_store: "Retail",
    shopping_mall: "Retail",
    food: "Food & Beverage",
    restaurant: "Hospitality",
    hospital: "Healthcare",
    pharmacy: "Pharma",
    bank: "BFSI",
    finance: "BFSI",
    insurance_agency: "BFSI",
    real_estate_agency: "Real Estate",
    general_contractor: "Construction",
    car_dealer: "Automotive",
    car_rental: "Automotive",
    lodging: "Hospitality",
    university: "Education",
    school: "Education",
    lawyer: "Legal",
    accounting: "Finance",
    doctor: "Healthcare",
  };
  for (const t of types) {
    if (MAP[t]) return MAP[t];
  }
  if (types.includes("establishment")) return "Corporate";
  return undefined;
}

function estimateGiftScore(place: PlacesResult): number {
  let score = 55;
  const count = place.user_ratings_total ?? 0;
  if (count > 500) score += 20;
  else if (count > 100) score += 12;
  else if (count > 20) score += 5;
  if (place.rating && place.rating >= 4.0) score += 8;
  if (place.website) score += 7;
  return Math.min(score, 99);
}

function extractDomain(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

function toScoutResult(place: PlacesResult): ScoutCompanyResult {
  const cityExtracted = extractCityFromAddress(place.formatted_address);
  const domain = place.website ? extractDomain(place.website) : undefined;

  return {
    name: place.name,
    domain,
    website: place.website,
    industry: inferIndustry(place.types),
    city: cityExtracted,
    employees: undefined,
    giftScore: estimateGiftScore(place),
    intelNotes: [
      place.formatted_phone_number && `Phone: ${place.formatted_phone_number}`,
      place.rating && `Google Rating: ${place.rating} (${place.user_ratings_total ?? 0} reviews)`,
      place.formatted_address && `Address: ${place.formatted_address}`,
    ]
      .filter(Boolean)
      .join(" · ") || undefined,
    dataSource: "google_places",
    externalId: place.place_id,
  };
}

export async function googlePlacesSearchCompanies(params: {
  cities: string[];
  industries: string[];
  limit?: number;
}): Promise<ScoutCompanyResult[]> {
  if (!process.env.GOOGLE_PLACES_API_KEY) return [];

  const results: ScoutCompanyResult[] = [];
  const limit = params.limit ?? 20;
  let lastError: Error | null = null;

  for (const city of params.cities.slice(0, 3)) {
    if (results.length >= limit) break;

    const industryStr =
      params.industries.length > 0 ? params.industries.slice(0, 2).join(" ") : "corporate";
    const query = `${industryStr} companies ${city} India`;

    try {
      const places = await placesTextSearch(query);

      for (const place of places.slice(0, Math.ceil(limit / params.cities.length))) {
        if (results.length >= limit) break;
        if (place.business_status === "CLOSED_PERMANENTLY") continue;

        let merged = place;
        if (!place.website && place.place_id && !place.place_id.startsWith("Ch")) {
          try {
            merged = { ...place, ...(await placeDetailsLegacy(place.place_id)) };
          } catch {
            // New API usually includes websiteUri — legacy details optional
          }
        }

        results.push(toScoutResult(merged));
      }
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      console.error(`[google-places] search failed for ${city}:`, lastError.message);
    }
  }

  if (!results.length && lastError) throw lastError;
  return results;
}

import type { ScoutCompanyResult, ScoutPersonResult } from "./types";

const BASE = "https://maps.googleapis.com/maps/api/place";

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
  photos?: { photo_reference: string }[];
};

async function placesTextSearch(query: string): Promise<PlacesResult[]> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) throw new Error("GOOGLE_PLACES_API_KEY not set");

  const url = `${BASE}/textsearch/json?query=${encodeURIComponent(query)}&region=in&language=en&key=${key}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Google Places text search failed: ${res.status}`);
  const data = await res.json();
  if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
    throw new Error(`Google Places error: ${data.status} — ${data.error_message ?? ""}`);
  }
  return data.results ?? [];
}

async function placeDetails(placeId: string): Promise<PlacesResult> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) throw new Error("GOOGLE_PLACES_API_KEY not set");

  const fields = "name,formatted_address,website,formatted_phone_number,rating,user_ratings_total,types,business_status";
  const url = `${BASE}/details/json?place_id=${placeId}&fields=${fields}&key=${key}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Google Places details failed: ${res.status}`);
  const data = await res.json();
  return data.result ?? {};
}

function extractCityFromAddress(address?: string): string | undefined {
  if (!address) return undefined;
  // Indian addresses typically end with "City, State, Country"
  const parts = address.split(",").map((p) => p.trim());
  // Try to find a known city
  const KNOWN_CITIES = ["Bangalore", "Bengaluru", "Hosur", "Mysore", "Mysuru", "Pune", "Chennai", "Mumbai", "Delhi", "Hyderabad"];
  for (const part of parts) {
    const match = KNOWN_CITIES.find((c) => part.toLowerCase().includes(c.toLowerCase()));
    if (match) return match === "Bengaluru" ? "Bangalore" : match === "Mysuru" ? "Mysore" : match;
  }
  // Fallback: second-last part is usually the city
  return parts.length >= 3 ? parts[parts.length - 3] : undefined;
}

function inferIndustry(types?: string[]): string | undefined {
  if (!types?.length) return undefined;
  const MAP: Record<string, string> = {
    "store": "Retail",
    "clothing_store": "Retail",
    "shopping_mall": "Retail",
    "food": "Food & Beverage",
    "restaurant": "Hospitality",
    "hospital": "Healthcare",
    "pharmacy": "Pharma",
    "bank": "BFSI",
    "finance": "BFSI",
    "insurance_agency": "BFSI",
    "real_estate_agency": "Real Estate",
    "general_contractor": "Construction",
    "car_dealer": "Automotive",
    "car_rental": "Automotive",
    "lodging": "Hospitality",
    "university": "Education",
    "school": "Education",
    "lawyer": "Legal",
    "accounting": "Finance",
    "doctor": "Healthcare",
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
  // More reviews = more established business = better gifting target
  if (count > 500) score += 20;
  else if (count > 100) score += 12;
  else if (count > 20) score += 5;
  if (place.rating && place.rating >= 4.0) score += 8;
  if (place.website) score += 7;
  return Math.min(score, 99);
}

export async function googlePlacesSearchCompanies(params: {
  cities: string[];
  industries: string[];
  limit?: number;
}): Promise<ScoutCompanyResult[]> {
  if (!process.env.GOOGLE_PLACES_API_KEY) return [];

  const results: ScoutCompanyResult[] = [];
  const limit = params.limit ?? 20;

  for (const city of params.cities.slice(0, 3)) {
    if (results.length >= limit) break;

    const industryStr = params.industries.length > 0
      ? params.industries.slice(0, 2).join(" OR ")
      : "corporate";

    const query = `${industryStr} companies ${city} India`;

    try {
      const places = await placesTextSearch(query);

      for (const place of places.slice(0, Math.ceil(limit / params.cities.length))) {
        if (results.length >= limit) break;
        if (place.business_status === "CLOSED_PERMANENTLY") continue;

        // Get details for website + phone
        let details: PlacesResult = place;
        try {
          if (place.place_id) {
            details = await placeDetails(place.place_id);
          }
        } catch {
          // use basic result if details fail
        }

        const merged = { ...place, ...details };
        const cityExtracted = extractCityFromAddress(merged.formatted_address) ?? city;
        const domain = merged.website ? extractDomain(merged.website) : undefined;

        results.push({
          name: merged.name,
          domain,
          website: merged.website,
          industry: inferIndustry(merged.types),
          city: cityExtracted,
          employees: undefined, // Places API doesn't have employee count
          giftScore: estimateGiftScore(merged),
          intelNotes: [
            merged.formatted_phone_number && `Phone: ${merged.formatted_phone_number}`,
            merged.rating && `Google Rating: ${merged.rating} (${merged.user_ratings_total ?? 0} reviews)`,
            merged.formatted_address && `Address: ${merged.formatted_address}`,
          ].filter(Boolean).join(" · ") || undefined,
          dataSource: "google_places",
          externalId: place.place_id,
        });
      }
    } catch (e) {
      console.error(`[google-places] search failed for ${city}:`, e);
    }
  }

  return results;
}

function extractDomain(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

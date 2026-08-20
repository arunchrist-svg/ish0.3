import type { ScoutCompanyResult } from "./types";
import { employeeSizeSearchClause } from "./employee-size";
import { isPlausibleCompanyName } from "./directory-parser";
import { isGeographicEntity } from "./company-name-match";
import { placesTypeForScoutBusiness } from "@/lib/scouting-data";
import { placeTypesMatchScoutBusiness } from "./business-match";

const NEW_API = "https://places.googleapis.com/v1/places:searchText";
const NEW_AUTOCOMPLETE = "https://places.googleapis.com/v1/places:autocomplete";
const LEGACY_BASE = "https://maps.googleapis.com/maps/api/place";

export type PlacesLocationBias = {
  lat: number;
  lng: number;
  radiusMeters: number;
};

function locationBiasBody(bias?: PlacesLocationBias) {
  if (!bias) return undefined;
  return {
    circle: {
      center: { latitude: bias.lat, longitude: bias.lng },
      radius: Math.max(100, bias.radiusMeters),
    },
  };
}

const NON_BUSINESS_PLACE_TYPES = new Set([
  "route",
  "street_address",
  "premise",
  "subpremise",
  "neighborhood",
  "sublocality",
  "sublocality_level_1",
  "sublocality_level_2",
  "locality",
  "administrative_area_level_1",
  "administrative_area_level_2",
  "administrative_area_level_3",
  "country",
  "postal_code",
  "plus_code",
  "geocode",
  "political",
  "park",
  "parking",
  "intersection",
  "landmark",
  "natural_feature",
  "town_square",
]);

function isBusinessPlace(place: { types?: string[]; name?: string }): boolean {
  const types = place.types ?? [];
  if (types.some((t) => NON_BUSINESS_PLACE_TYPES.has(t)) && !types.some((t) => /establishment|store|factory|point_of_interest|company/i.test(t))) {
    return false;
  }
  if (types.includes("route") || types.includes("street_address") || types.includes("premise")) {
    return false;
  }
  const name = place.name ?? "";
  if (!isPlausibleCompanyName(name) || isGeographicEntity(name)) return false;
  return true;
}

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
  location?: { latitude?: number; longitude?: number };
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

async function placesTextSearchNew(
  query: string,
  bias?: PlacesLocationBias,
  includedType?: string,
): Promise<PlacesResult[]> {
  const res = await fetch(NEW_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey(),
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.formattedAddress,places.websiteUri,places.nationalPhoneNumber,places.rating,places.userRatingCount,places.types,places.businessStatus,places.location",
    },
    body: JSON.stringify({
      textQuery: query,
      regionCode: "IN",
      languageCode: "en",
      ...(includedType ? { includedType } : {}),
      ...(locationBiasBody(bias) ? { locationBias: locationBiasBody(bias) } : {}),
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.error?.message ?? `Google Places (New) failed: ${res.status}`;
    throw new Error(msg);
  }

  return ((data.places as NewPlace[] | undefined) ?? []).map(mapNewPlace);
}

async function placesTextSearchLegacy(query: string, bias?: PlacesLocationBias): Promise<PlacesResult[]> {
  const biasQs = bias
    ? `&location=${encodeURIComponent(`${bias.lat},${bias.lng}`)}&radius=${Math.round(bias.radiusMeters)}`
    : "";
  const url = `${LEGACY_BASE}/textsearch/json?query=${encodeURIComponent(query)}&region=in&language=en${biasQs}&key=${apiKey()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Google Places text search failed: ${res.status}`);
  const data = await res.json();
  if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
    throw new Error(`Google Places error: ${data.status} - ${data.error_message ?? ""}`);
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

async function placesTextSearch(
  query: string,
  bias?: PlacesLocationBias,
  includedType?: string,
): Promise<PlacesResult[]> {
  try {
    return await placesTextSearchNew(query, bias, includedType);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/legacy|not enabled|REQUEST_DENIED/i.test(msg)) {
      return placesTextSearchLegacy(query, bias);
    }
    throw e;
  }
}

export type PlacesAreaSuggestion = {
  placeId: string;
  text: string;
};

export async function googlePlacesAutocompleteAreas(params: {
  query: string;
  city?: string;
  locationBias?: PlacesLocationBias;
}): Promise<PlacesAreaSuggestion[]> {
  if (!process.env.GOOGLE_PLACES_API_KEY || !params.query.trim()) return [];
  const input = params.city ? `${params.query.trim()}, ${params.city}, India` : `${params.query.trim()}, India`;
  try {
    const res = await fetch(NEW_AUTOCOMPLETE, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey(),
      },
      body: JSON.stringify({
        input,
        includedRegionCodes: ["IN"],
        languageCode: "en",
        includedPrimaryTypes: ["neighborhood", "sublocality", "sublocality_level_1", "locality"],
        ...(locationBiasBody(params.locationBias) ? { locationBias: locationBiasBody(params.locationBias) } : {}),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      const predictions = (data.suggestions as Array<{ placePrediction?: { placeId?: string; text?: { text?: string } } }> | undefined) ?? [];
      return predictions
        .map((row) => ({
          placeId: row.placePrediction?.placeId ?? "",
          text: row.placePrediction?.text?.text ?? "",
        }))
        .filter((row) => row.placeId && row.text);
    }
  } catch {
    /* fall through to legacy */
  }

  const biasQs = params.locationBias
    ? `&location=${encodeURIComponent(`${params.locationBias.lat},${params.locationBias.lng}`)}&radius=${Math.round(params.locationBias.radiusMeters)}`
    : "";
  const url = `${LEGACY_BASE}/autocomplete/json?input=${encodeURIComponent(input)}&components=country:in&language=en${biasQs}&key=${apiKey()}`;
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (data.status && data.status !== "OK" && data.status !== "ZERO_RESULTS") return [];
  return ((data.predictions as Array<{ place_id?: string; description?: string }> | undefined) ?? [])
    .map((row) => ({ placeId: row.place_id ?? "", text: row.description ?? "" }))
    .filter((row) => row.placeId && row.text);
}

export async function googlePlacesGeocodePlace(placeId: string): Promise<{ lat: number; lng: number; name: string } | null> {
  if (!process.env.GOOGLE_PLACES_API_KEY || !placeId.trim()) return null;
  try {
    const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
      headers: {
        "X-Goog-Api-Key": apiKey(),
        "X-Goog-FieldMask": "id,displayName,location",
      },
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      const lat = data.location?.latitude;
      const lng = data.location?.longitude;
      const name = data.displayName?.text;
      if (typeof lat === "number" && typeof lng === "number") {
        return { lat, lng, name: typeof name === "string" && name.trim() ? name.trim() : placeId };
      }
    }
  } catch {
    /* fall through to legacy */
  }

  const url = `${LEGACY_BASE}/details/json?place_id=${encodeURIComponent(placeId)}&fields=name,geometry&key=${apiKey()}`;
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  const lat = data.result?.geometry?.location?.lat;
  const lng = data.result?.geometry?.location?.lng;
  const name = data.result?.name;
  if (typeof lat === "number" && typeof lng === "number") {
    return { lat, lng, name: typeof name === "string" && name.trim() ? name.trim() : placeId };
  }
  return null;
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

function estimateFitScore(place: PlacesResult): number {
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

function toScoutResult(place: PlacesResult, geoVerified = false): ScoutCompanyResult {
  const cityExtracted = extractCityFromAddress(place.formatted_address);
  const domain = place.website ? extractDomain(place.website) : undefined;

  return {
    name: place.name,
    domain,
    website: place.website,
    industry: inferIndustry(place.types),
    city: cityExtracted,
    employees: undefined,
    fitScore: estimateFitScore(place),
    intelNotes: [
      place.formatted_phone_number && `Phone: ${place.formatted_phone_number}`,
      place.rating && `Google Rating: ${place.rating} (${place.user_ratings_total ?? 0} reviews)`,
      place.formatted_address && `Address: ${place.formatted_address}`,
    ]
      .filter(Boolean)
      .join(" · ") || undefined,
    dataSource: "google_places",
    externalId: place.place_id,
    ...(geoVerified ? { scoutGeoVerified: true } : {}),
  };
}

function rotatedSlots<T>(items: T[], count: number, offset: number): T[] {
  if (!items.length || count <= 0) return [];
  const slots: T[] = [];
  for (let i = 0; i < Math.min(count, items.length); i++) {
    slots.push(items[(offset + i) % items.length]!);
  }
  return slots;
}

export async function googlePlacesSearchCompanies(params: {
  cities: string[];
  industries: string[];
  limit?: number;
  employeeBands?: string[];
  locationBias?: PlacesLocationBias;
  searchKind?: "industry" | "business";
  fetchSeed?: number;
}): Promise<ScoutCompanyResult[]> {
  if (!process.env.GOOGLE_PLACES_API_KEY) return [];

  const results: ScoutCompanyResult[] = [];
  const limit = params.limit ?? 20;
  let lastError: Error | null = null;
  const seed = Math.abs(params.fetchSeed ?? 0);
  const allCities = params.cities.filter(Boolean);
  const citySlots = params.locationBias
    ? rotatedSlots(allCities, Math.min(4, allCities.length || 1), seed % Math.max(allCities.length, 1))
    : allCities.slice(0, 3);
  const allTerms =
    params.searchKind === "business"
      ? params.industries.length
        ? params.industries
        : ["establishment"]
      : [params.industries.slice(0, 2).join(" ") || "corporate"];
  const termSlots =
    params.searchKind === "business"
      ? rotatedSlots(allTerms, Math.min(5, allTerms.length), seed % Math.max(allTerms.length, 1))
      : allTerms;
  const geoVerified = Boolean(params.locationBias);
  const sizeStr = employeeSizeSearchClause(params.employeeBands);

  for (const city of citySlots) {
    if (results.length >= limit) break;
    for (const term of termSlots) {
      if (results.length >= limit) break;
      const includedType = params.searchKind === "business" ? placesTypeForScoutBusiness(term) : undefined;
      const query =
        params.searchKind === "business"
          ? `${term} ${city} India${sizeStr ? ` ${sizeStr}` : ""}`
          : `${term} companies ${city}${sizeStr ? ` ${sizeStr}` : ""} India`;

      try {
        const places = await placesTextSearch(query, params.locationBias, includedType);

        for (const place of places.slice(0, Math.ceil(limit / Math.max(citySlots.length * termSlots.length, 1)))) {
          if (results.length >= limit) break;
          if (place.business_status === "CLOSED_PERMANENTLY") continue;
          if (!isBusinessPlace(place)) continue;
          if (
            params.searchKind === "business" &&
            !placeTypesMatchScoutBusiness(place.types, term)
          ) {
            continue;
          }

          let merged = place;
          if (!place.website && place.place_id && !place.place_id.startsWith("Ch")) {
            try {
              merged = { ...place, ...(await placeDetailsLegacy(place.place_id)) };
            } catch {
              // New API usually includes websiteUri; legacy details are optional
            }
          }

          results.push(toScoutResult(merged, geoVerified));
        }
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
        console.error(`[google-places] search failed for ${city}:`, lastError.message);
      }
    }
  }

  if (!results.length && lastError) throw lastError;
  return results;
}

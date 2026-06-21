import type { EnrichmentInput, EnrichmentProvider, EnrichmentResult } from "../enrich-types";
import { sanitizePhone } from "../validate-contact";

const BASE = "https://places.googleapis.com/v1/places:searchText";

export const googlePlacesProvider: EnrichmentProvider = {
  id: "google_places",
  name: "Google Places Phone",
  capabilities: ["enrich"],
  isConfigured: () => !!process.env.GOOGLE_PLACES_API_KEY,

  async enrich(input: EnrichmentInput): Promise<EnrichmentResult | null> {
    const key = process.env.GOOGLE_PLACES_API_KEY;
    if (!key) return null;

    const query = `${input.company} ${input.city ?? "India"} corporate office`;
    try {
      const res = await fetch(BASE, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": key,
          "X-Goog-FieldMask": "places.nationalPhoneNumber,places.formattedAddress",
        },
        body: JSON.stringify({ textQuery: query, maxResultCount: 1 }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      const phoneRaw = data.places?.[0]?.nationalPhoneNumber as string | undefined;
      const phone = sanitizePhone(phoneRaw);
      if (!phone) return null;

      return {
        providerId: "google_places",
        contact: {
          name: input.name,
          title: input.title,
          company: input.company,
          city: input.city,
          phone,
        },
      };
    } catch (e) {
      console.error("[google-places-phone] failed:", e);
      return null;
    }
  },
};

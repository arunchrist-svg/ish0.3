import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { handleApiError } from "@/lib/api-errors";
import {
  cityCenterForCatalog,
  resolveAreaOfFocus,
  suggestCatalogAreas,
} from "@/lib/geo/area-of-focus";
import { googlePlacesAutocompleteAreas } from "@/lib/enrichment/google-places";

export async function POST(req: Request) {
  try {
    await requireTenantContext();
    const body = (await req.json()) as { city?: string; query?: string; radiusKm?: number };
    const city = typeof body.city === "string" ? body.city.trim() : "";
    const query = typeof body.query === "string" ? body.query.trim() : "";
    if (!city || !query) {
      return NextResponse.json({ error: "city and query are required" }, { status: 400 });
    }
    const focus = await resolveAreaOfFocus({ city, query, radiusKm: body.radiusKm ?? 5 });
    if (!focus) {
      return NextResponse.json({ error: "Could not resolve that area" }, { status: 404 });
    }
    return NextResponse.json({ focus });
  } catch (e) {
    const err = handleApiError(e, "[api/scout/areas/resolve]");
    if (err.status !== 500) return err;
    return NextResponse.json({ error: "Failed to resolve area" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    await requireTenantContext();
    const url = new URL(req.url);
    const city = url.searchParams.get("city")?.trim() ?? "";
    const query = url.searchParams.get("q")?.trim() ?? "";
    if (!city) {
      return NextResponse.json({ error: "city is required" }, { status: 400 });
    }
    const catalog = suggestCatalogAreas(city, query);
    const suggestions: Array<{ name: string; source: "catalog" | "places" }> = catalog.map((row) => ({
      name: row.name,
      source: "catalog",
    }));
    if (query.length >= 2 && process.env.GOOGLE_PLACES_API_KEY) {
      try {
        const center = cityCenterForCatalog(city);
        const places = await googlePlacesAutocompleteAreas({
          query,
          city,
          locationBias: center ? { lat: center.lat, lng: center.lng, radiusMeters: 25_000 } : undefined,
        });
        const seen = new Set(suggestions.map((row) => row.name.toLowerCase()));
        for (const place of places) {
          const name = place.text.split(",")[0]?.trim() ?? "";
          if (!name || seen.has(name.toLowerCase())) continue;
          seen.add(name.toLowerCase());
          suggestions.push({ name, source: "places" });
        }
      } catch {
        /* catalog suggestions still work */
      }
    }
    return NextResponse.json({ suggestions: suggestions.slice(0, 10) });
  } catch (e) {
    const err = handleApiError(e, "[api/scout/areas/suggest]");
    if (err.status !== 500) return err;
    return NextResponse.json({ error: "Failed to suggest areas" }, { status: 500 });
  }
}

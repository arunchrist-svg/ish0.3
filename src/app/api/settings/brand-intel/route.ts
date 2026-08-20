import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { handleApiError } from "@/lib/api-errors";
import { getResolvedEnrichmentConfigForWorkspace } from "@/lib/settings/workspace-settings";
import { resolveGiftIntelConfig } from "@/lib/brand-intel/config";
import { scoutLocationOptions, normalizeScoutGeo, summarizeScoutGeo } from "@/lib/geo/india";

export async function GET() {
  try {
    const ctx = await requireTenantContext();
    const enrichment = await getResolvedEnrichmentConfigForWorkspace(ctx.workspaceId);
    const giftIntel = resolveGiftIntelConfig(enrichment);
    const scoutGeo = normalizeScoutGeo(enrichment.scoutGeo);
    const locations = scoutLocationOptions(scoutGeo, enrichment.scoutAreasOfFocus ?? enrichment.scoutAreaOfFocus);
    const focuses = enrichment.scoutAreasOfFocus?.length
      ? enrichment.scoutAreasOfFocus
      : enrichment.scoutAreaOfFocus
        ? [enrichment.scoutAreaOfFocus]
        : [];
    return NextResponse.json({
      ...giftIntel,
      locations,
      locationSummary: focuses.length
        ? focuses.map((row) => `${row.areaName} + ${row.radiusKm} km`).join(", ")
        : summarizeScoutGeo(scoutGeo),
    });
  } catch (e) {
    return handleApiError(e, "[api/settings/gift-intel]");
  }
}

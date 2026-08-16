import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { handleApiError } from "@/lib/api-errors";
import { getResolvedEnrichmentConfigForWorkspace } from "@/lib/settings/workspace-settings";
import { resolveGiftIntelConfig } from "@/lib/brand-intel/config";
import { locationOptionsFromSelection, normalizeScoutGeo, summarizeScoutGeo } from "@/lib/geo/india";

export async function GET() {
  try {
    const ctx = await requireTenantContext();
    const enrichment = await getResolvedEnrichmentConfigForWorkspace(ctx.workspaceId);
    const giftIntel = resolveGiftIntelConfig(enrichment);
    const scoutGeo = normalizeScoutGeo(enrichment.scoutGeo);
    const locations = locationOptionsFromSelection(scoutGeo);
    return NextResponse.json({
      ...giftIntel,
      locations,
      locationSummary: summarizeScoutGeo(scoutGeo),
    });
  } catch (e) {
    return handleApiError(e, "[api/settings/gift-intel]");
  }
}

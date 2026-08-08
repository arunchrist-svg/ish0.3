import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { handleApiError } from "@/lib/api-errors";
import { getResolvedWorkspaceEnrichmentConfig } from "@/lib/settings/workspace-settings";
import { locationOptionsFromSelection, normalizeScoutGeo } from "@/lib/geo/india";

export async function GET() {
  try {
    await requireTenantContext();
    const config = await getResolvedWorkspaceEnrichmentConfig();
    const scoutGeo = normalizeScoutGeo(config.scoutGeo);
    return NextResponse.json({
      scoutGeo,
      locations: locationOptionsFromSelection(scoutGeo),
    });
  } catch (e) {
    const err = handleApiError(e, "[api/scout/locations]");
    if (err.status !== 500) return err;
    return NextResponse.json({ error: "Failed to load scout locations" }, { status: 500 });
  }
}

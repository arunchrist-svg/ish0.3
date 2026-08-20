import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { handleApiError } from "@/lib/api-errors";
import { getResolvedWorkspaceEnrichmentConfig } from "@/lib/settings/workspace-settings";
import {
  defaultScoutLocationScope,
  normalizeScoutGeo,
  parseScoutLocationScope,
  scoutLocationOptions,
} from "@/lib/geo/india";
import { normalizeScoutAreasOfFocus } from "@/lib/geo/area-of-focus";

export async function GET(req: Request) {
  try {
    await requireTenantContext();
    const config = await getResolvedWorkspaceEnrichmentConfig();
    const scoutGeo = normalizeScoutGeo(config.scoutGeo);
    const scoutAreasOfFocus = normalizeScoutAreasOfFocus(config.scoutAreasOfFocus, config.scoutAreaOfFocus);
    const scoutAreaOfFocus = scoutAreasOfFocus[0] ?? null;
    const requested = parseScoutLocationScope(new URL(req.url).searchParams.get("scope"));
    const scope = requested ?? defaultScoutLocationScope(scoutAreasOfFocus);
    return NextResponse.json({
      scoutGeo,
      scoutAreaOfFocus,
      scoutAreasOfFocus,
      scope,
      locations: scoutLocationOptions(scoutGeo, scoutAreasOfFocus, scope),
      focusLocations: scoutLocationOptions(scoutGeo, scoutAreasOfFocus, "focus"),
      interestLocations: scoutLocationOptions(scoutGeo, scoutAreasOfFocus, "interest"),
    });
  } catch (e) {
    const err = handleApiError(e, "[api/scout/locations]");
    if (err.status !== 500) return err;
    return NextResponse.json({ error: "Failed to load scout locations" }, { status: 500 });
  }
}

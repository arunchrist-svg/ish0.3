import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { handleApiError } from "@/lib/api-errors";
import { db, leads, contacts, accounts } from "@/db";
import { eq, desc } from "drizzle-orm";
import { listSavedScoutCompanies } from "@/lib/scout/save-leads";
import { getResolvedEnrichmentConfigForWorkspace } from "@/lib/settings/workspace-settings";
import {
  defaultScoutLocationScope,
  normalizeScoutGeo,
  scoutLocationOptions,
} from "@/lib/geo/india";
import { normalizeScoutAreasOfFocus } from "@/lib/geo/area-of-focus";

/** Single round trip for scout page init: dedupe map, saved companies, settings, locations. */
export async function GET() {
  try {
    const ctx = await requireTenantContext();

    const [dedupeRows, companies, config] = await Promise.all([
      db
        .select({
          id: leads.id,
          name: contacts.name,
          company: accounts.name,
        })
        .from(leads)
        .innerJoin(contacts, eq(contacts.id, leads.contactId))
        .innerJoin(accounts, eq(accounts.id, leads.accountId))
        .where(eq(leads.tenantId, ctx.tenantId))
        .orderBy(desc(leads.createdAt))
        .limit(500),
      listSavedScoutCompanies({
        tenantId: ctx.tenantId,
        workspaceId: ctx.workspaceId,
      }),
      getResolvedEnrichmentConfigForWorkspace(ctx.workspaceId),
    ]);

    const scoutGeo = normalizeScoutGeo(config.scoutGeo);
    const scoutAreasOfFocus = normalizeScoutAreasOfFocus(config.scoutAreasOfFocus, config.scoutAreaOfFocus);
    const scoutAreaOfFocus = scoutAreasOfFocus[0] ?? null;
    const scope = defaultScoutLocationScope(scoutAreasOfFocus);

    return NextResponse.json(
      {
        leads: dedupeRows,
        companies,
        dataMode: config.dataMode,
        scoutCompaniesLimit: config.scoutCompaniesLimit,
        scoutLeadsLimit: config.scoutLeadsLimit,
        scoutPeopleCities: config.scoutPeopleCities ?? [],
        scoutGeo,
        scoutAreaOfFocus,
        scoutAreasOfFocus,
        scope,
        locations: scoutLocationOptions(scoutGeo, scoutAreasOfFocus, scope),
        focusLocations: scoutLocationOptions(scoutGeo, scoutAreasOfFocus, "focus"),
        interestLocations: scoutLocationOptions(scoutGeo, scoutAreasOfFocus, "interest"),
      },
      { headers: { "Cache-Control": "private, max-age=30" } },
    );
  } catch (e) {
    return handleApiError(e, "[api/scout/bootstrap]");
  }
}

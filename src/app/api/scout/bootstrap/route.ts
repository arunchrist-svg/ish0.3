import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { handleApiError } from "@/lib/api-errors";
import { db, leads, contacts, accounts } from "@/db";
import { eq, desc, and } from "drizzle-orm";
import { getResolvedEnrichmentConfigForWorkspace } from "@/lib/settings/workspace-settings";
import {
  defaultScoutLocationScope,
  normalizeScoutGeo,
  scoutLocationOptions,
} from "@/lib/geo/india";
import { normalizeScoutAreasOfFocus } from "@/lib/geo/area-of-focus";
import { mark, startTiming, withServerTiming } from "@/lib/perf/server-timing";
import { withLeadVisibility } from "@/lib/leads/lead-visibility";
import { hasApolloKey } from "@/lib/enrichment/config";

export const preferredRegion = ["sin1"];

/** Compact scout mount: dedupe keys + thin saved companies + settings/locations. */
export async function GET() {
  const { marks, t0 } = startTiming();
  try {
    const authStart = performance.now();
    const ctx = await requireTenantContext();
    mark(marks, "auth", authStart);

    const dbStart = performance.now();
    const [dedupeRows, savedCompanies, config] = await Promise.all([
      db
        .select({
          id: leads.id,
          name: contacts.name,
          company: accounts.name,
        })
        .from(leads)
        .innerJoin(contacts, eq(contacts.id, leads.contactId))
        .innerJoin(accounts, eq(accounts.id, leads.accountId))
        .where(withLeadVisibility(ctx, eq(leads.tenantId, ctx.tenantId)))
        .orderBy(desc(leads.createdAt))
        .limit(2000),
      db
        .select({
          id: accounts.id,
          name: accounts.name,
          domain: accounts.domain,
          city: accounts.city,
          website: accounts.website,
        })
        .from(accounts)
        .where(
          and(
            eq(accounts.tenantId, ctx.tenantId),
            eq(accounts.workspaceId, ctx.workspaceId),
          ),
        )
        .orderBy(desc(accounts.updatedAt))
        .limit(200),
      getResolvedEnrichmentConfigForWorkspace(ctx.workspaceId),
    ]);
    mark(marks, "db", dbStart);

    const dedupeKeys = dedupeRows.map((r) => ({
      id: r.id,
      key: `${r.company.toLowerCase()}|${r.name.toLowerCase()}`,
      name: r.name,
      company: r.company,
    }));

    const scoutGeo = normalizeScoutGeo(config.scoutGeo);
    const scoutAreasOfFocus = normalizeScoutAreasOfFocus(config.scoutAreasOfFocus, config.scoutAreaOfFocus);
    const scoutAreaOfFocus = scoutAreasOfFocus[0] ?? null;
    const scope = defaultScoutLocationScope(scoutAreasOfFocus);

    const res = NextResponse.json(
      {
        leads: dedupeRows,
        dedupeKeys,
        companies: savedCompanies.map((c) => ({
          id: c.id,
          name: c.name,
          domain: c.domain ?? undefined,
          city: c.city ?? undefined,
          website: c.website ?? undefined,
        })),
        dataMode: config.dataMode,
        searchProvider: config.searchProvider,
        peopleSearchProvider: config.peopleSearchProvider,
        scaleVerificationAvailable: hasApolloKey(),
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
      { headers: { "Cache-Control": "private, no-store" } },
    );
    return withServerTiming(res, marks, t0);
  } catch (e) {
    return handleApiError(e, "[api/scout/bootstrap]");
  }
}

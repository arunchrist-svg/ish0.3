import { NextResponse } from "next/server";
import { discoverCompanies } from "@/lib/enrichment/waterfall";
import { checkDiscoveryPrerequisites } from "@/lib/enrichment/discovery-prerequisites";
import type { DataMode } from "@/lib/enrichment/types";
import {
  getResolvedWorkspaceEnrichmentConfig,
  loadWorkspaceEnrichmentOverrides,
} from "@/lib/settings/workspace-settings";

const DEFAULT_TENANT = "00000000-0000-0000-0000-000000000001";
const DEFAULT_WORKSPACE = "00000000-0000-0000-0000-000000000002";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      cities = [],
      industries = [],
      dataMode = (process.env.DEFAULT_DATA_MODE ?? "free") as DataMode,
      searchProvider,
      enrichProvider,
      excludeNames = [],
      skipInternal = false,
      fetchSeed = 0,
      limit: requestedLimit,
      companyName,
    } = body;

    if (!cities.length) {
      return NextResponse.json({ error: "Select at least one city." }, { status: 400 });
    }

    const requestOverride = {
      ...(searchProvider ? { searchProvider } : {}),
      ...(enrichProvider ? { enrichProvider } : {}),
      dataMode,
    };
    const storedSettings = await loadWorkspaceEnrichmentOverrides();
    const cfg = await getResolvedWorkspaceEnrichmentConfig(requestOverride);
    const discoveryConfig = { ...storedSettings, ...requestOverride };
    const limit = Math.min(requestedLimit ?? cfg.scoutCompaniesLimit, 100);

    const prerequisiteErrors = checkDiscoveryPrerequisites(cfg);
    const blockingErrors = prerequisiteErrors.filter((e) =>
      /TAVILY_API_KEY is missing|APOLLO_API_KEY is missing|GOOGLE_PLACES_API_KEY is missing/.test(e),
    );

    if (blockingErrors.length) {
      return NextResponse.json(
        {
          companies: [],
          hasMore: false,
          limit,
          warnings: [],
          errors: blockingErrors,
        },
        { status: 200 },
      );
    }

    const { companies, warnings, errors } = await discoverCompanies({
      tenantId: DEFAULT_TENANT,
      workspaceId: DEFAULT_WORKSPACE,
      cities,
      industries,
      dataMode: cfg.dataMode,
      config: discoveryConfig,
      limit,
      excludeNames,
      skipInternal,
      fetchSeed,
      ...(companyName ? { companyName } : {}),
    });

    const softPrereqWarnings = prerequisiteErrors.filter((e) => !blockingErrors.includes(e));
    const allWarnings = [...softPrereqWarnings, ...warnings];
    const allErrors = [...errors];

    if (!companies.length && !allErrors.length && !allWarnings.length) {
      allWarnings.push(
        "No companies matched the current filters. Try different cities or leave industries unselected for broader results.",
      );
    }

    return NextResponse.json({
      companies,
      hasMore: companies.length >= limit,
      limit,
      warnings: [...new Set(allWarnings)],
      errors: [...new Set(allErrors)],
    });
  } catch (e) {
    console.error("[api/scout/companies]", e);
    const message = e instanceof Error ? e.message : "Discovery failed";
    return NextResponse.json({ error: message, errors: [message] }, { status: 500 });
  }
}

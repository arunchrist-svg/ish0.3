import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { assertCredits, deductCredits } from "@/lib/billing/credits";
import { discoverCompanies } from "@/lib/enrichment/waterfall";
import { checkDiscoveryPrerequisites } from "@/lib/enrichment/discovery-prerequisites";
import type { DataMode, ScoutCompanyResult } from "@/lib/enrichment/types";
import { requirePipelineWrite } from "@/lib/auth/permissions";
import {
  getResolvedWorkspaceEnrichmentConfig,
  loadWorkspaceEnrichmentOverrides,
} from "@/lib/settings/workspace-settings";
import { normalizeEmployeeBandIds } from "@/lib/enrichment/employee-size";
import { MAX_SCOUT_COMPANIES_LIMIT } from "@/lib/enrichment/config";

/** Empty-result copy that names the actual lever to pull for the mode that was run. */
function emptyResultMessage(params: {
  cities: string[];
  industries: string[];
  locationScope?: "focus" | "interest";
}): string {
  if (params.locationScope === "focus") {
    return "No companies found near your focus area. Widen the focus radius, or switch to Area of Interest to search the whole city.";
  }
  const where = params.cities.length ? ` in ${params.cities.slice(0, 3).join(", ")}` : "";
  if (params.industries.length > 3) {
    return `No companies found${where}. Narrow to 2-3 industries: long industry lists dilute the search.`;
  }
  return `No companies found${where}. Try a nearby larger city, or switch data mode to Auto for paid providers.`;
}

export async function POST(req: Request) {
  try {
    const ctx = await requireTenantContext();
    requirePipelineWrite(ctx);
    const stream = new URL(req.url).searchParams.get("stream") === "1";
    const body = await req.json();
    const {
      cities = [],
      industries = [],
      dataMode = (process.env.DEFAULT_DATA_MODE ?? "free") as DataMode,
      searchProvider,
      enrichProvider,
      excludeNames = [],
      excludeSavedAccounts,
      skipInternal = false,
      fetchSeed = 0,
      limit: requestedLimit,
      companyName,
      employeeBands: rawEmployeeBands = [],
      seniority = [],
      departments = [],
      locationScope,
      searchKind,
    } = body;
    const employeeBands = normalizeEmployeeBandIds(
      Array.isArray(rawEmployeeBands) ? rawEmployeeBands.map(String) : [],
    );

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
    const limit = Math.min(requestedLimit ?? cfg.scoutCompaniesLimit, MAX_SCOUT_COMPANIES_LIMIT);

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

    await assertCredits(ctx.tenantId, "scout.company", limit);

    const discoverParams = {
      tenantId: ctx.tenantId,
      workspaceId: ctx.workspaceId,
      cities,
      industries,
      dataMode: cfg.dataMode,
      config: discoveryConfig,
      limit,
      excludeNames,
      excludeSavedAccounts,
      skipInternal,
      fetchSeed,
      ...(companyName ? { companyName } : {}),
      employeeBands,
      seniority: Array.isArray(seniority) ? seniority.map(String) : [],
      departments: Array.isArray(departments) ? departments.map(String) : [],
      locationScope: locationScope === "interest" || locationScope === "focus" ? locationScope : undefined,
      searchKind: searchKind === "business" || searchKind === "industry" ? searchKind : undefined,
    };

    if (stream) {
      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();
      const encoder = new TextEncoder();

      const write = async (payload: unknown) => {
        await writer.write(encoder.encode(`${JSON.stringify(payload)}\n`));
      };

      void (async () => {
        try {
          const result = await discoverCompanies({
            ...discoverParams,
            onPartial: async (companies: ScoutCompanyResult[]) => {
              await write({ type: "partial", companies, limit });
            },
          });

          const softPrereqWarnings = prerequisiteErrors.filter((e) => !blockingErrors.includes(e));
          const allWarnings = [...softPrereqWarnings, ...result.warnings];
          const allErrors = [...result.errors];

          if (!result.companies.length && !allErrors.length && !allWarnings.length) {
            allWarnings.push(
              emptyResultMessage({
                cities,
                industries,
                locationScope: discoverParams.locationScope,
              }),
            );
          }

          if (result.companies.length > 0) {
            await deductCredits({
              tenantId: ctx.tenantId,
              userId: ctx.userId,
              role: ctx.role,
              action: "scout.company",
              quantity: result.companies.length,
              referenceId: `scout-companies-${Date.now()}`,
            });
          }

          await write({
            type: "done",
            companies: result.companies,
            hasMore: result.companies.length >= limit,
            limit,
            warnings: [...new Set(allWarnings)],
            errors: [...new Set(allErrors)],
          });
          await writer.close();
        } catch (e) {
          console.error("[api/scout/companies:stream]", e);
          const { handleApiError } = await import("@/lib/api-errors");
          const errRes = handleApiError(e, "[api/scout/companies:stream]");
          const body = await errRes.json().catch(() => ({ error: "Discovery failed" }));
          const message =
            typeof body.error === "string" ? body.error : e instanceof Error ? e.message : "Discovery failed";
          try {
            await write({ type: "done", companies: [], hasMore: false, limit, warnings: [], errors: [message] });
            await writer.close();
          } catch {
            await writer.abort(e);
          }
        }
      })();

      return new Response(readable, {
        headers: {
          "Content-Type": "application/x-ndjson",
          "Cache-Control": "no-store",
        },
      });
    }

    const { companies, warnings, errors } = await discoverCompanies(discoverParams);

    const softPrereqWarnings = prerequisiteErrors.filter((e) => !blockingErrors.includes(e));
    const allWarnings = [...softPrereqWarnings, ...warnings];
    const allErrors = [...errors];

    if (!companies.length && !allErrors.length && !allWarnings.length) {
      allWarnings.push(
        emptyResultMessage({ cities, industries, locationScope: discoverParams.locationScope }),
      );
    }

    if (companies.length > 0) {
      await deductCredits({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        role: ctx.role,
        action: "scout.company",
        quantity: companies.length,
        referenceId: `scout-companies-${Date.now()}`,
      });
    }

    return NextResponse.json({
      companies,
      hasMore: companies.length >= limit,
      limit,
      warnings: [...new Set(allWarnings)],
      errors: [...new Set(allErrors)],
    });
  } catch (e) {
    const { handleApiError } = await import("@/lib/api-errors");
    const errRes = handleApiError(e, "[api/scout/companies]");
    if (errRes.status !== 500) return errRes;
    console.error("[api/scout/companies]", e);
    const message = e instanceof Error ? e.message : "Discovery failed";
    return NextResponse.json({ error: message, errors: [message] }, { status: 500 });
  }
}

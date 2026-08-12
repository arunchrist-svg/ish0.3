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
      skipInternal = false,
      fetchSeed = 0,
      limit: requestedLimit,
      companyName,
      employeeBands: rawEmployeeBands = [],
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
      skipInternal,
      fetchSeed,
      ...(companyName ? { companyName } : {}),
      employeeBands,
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
              "No companies matched the current filters. Try different cities or leave industries unselected for broader results.",
            );
          }

          if (result.companies.length > 0) {
            await deductCredits({
              tenantId: ctx.tenantId,
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
          const message = e instanceof Error ? e.message : "Discovery failed";
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
        "No companies matched the current filters. Try different cities or leave industries unselected for broader results.",
      );
    }

    if (companies.length > 0) {
      await deductCredits({
        tenantId: ctx.tenantId,
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

import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { assertCredits, deductCredits } from "@/lib/billing/credits";
import { discoverPeople } from "@/lib/enrichment/waterfall";
import type { DataMode } from "@/lib/enrichment/types";
import { getResolvedWorkspaceEnrichmentConfig } from "@/lib/settings/workspace-settings";
import { requirePipelineWrite } from "@/lib/auth/permissions";
import { MAX_SCOUT_LEADS_LIMIT } from "@/lib/enrichment/config";
import { handleApiError } from "@/lib/api-errors";

export async function POST(req: Request) {
  try {
    const ctx = await requireTenantContext();
    requirePipelineWrite(ctx);
    const body = await req.json();
    const {
      companyName,
      companyDomain,
      companyWebsite,
      dataMode = (process.env.DEFAULT_DATA_MODE ?? "free") as DataMode,
      searchProvider,
      enrichProvider,
      limit: requestedLimit,
      seniority = [],
      departments = [],
      cities = [],
      peopleCities = [],
      searchKind,
      businesses = [],
      locationScope,
    } = body;

    if (!companyName) {
      return NextResponse.json({ error: "companyName required" }, { status: 400 });
    }

    const requestOverride = {
      ...(searchProvider ? { searchProvider } : {}),
      ...(enrichProvider ? { enrichProvider } : {}),
      dataMode,
    };
    const cfg = await getResolvedWorkspaceEnrichmentConfig(requestOverride);
    const discoveryConfig = { ...cfg, ...requestOverride };

    const limit = Math.min(requestedLimit ?? cfg.scoutLeadsLimit, MAX_SCOUT_LEADS_LIMIT);
    await assertCredits(ctx.tenantId, "scout.contact", limit);

    const { people, warnings, errors, resolvedDomain, resolvedWebsite } = await discoverPeople({
      tenantId: ctx.tenantId,
      workspaceId: ctx.workspaceId,
      companyName,
      companyDomain,
      companyWebsite,
      dataMode: cfg.dataMode,
      config: discoveryConfig,
      limit,
      seniority,
      departments,
      cities,
      peopleCities: Array.isArray(peopleCities) ? peopleCities.map(String) : [],
      searchKind: searchKind === "business" || searchKind === "industry" ? searchKind : undefined,
      businesses: Array.isArray(businesses) ? businesses.map(String) : [],
      locationScope: locationScope === "focus" || locationScope === "interest" ? locationScope : undefined,
    });

    if (people.length > 0) {
      await deductCredits({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        role: ctx.role,
        action: "scout.contact",
        quantity: people.length,
        referenceId: `scout-people-${Date.now()}`,
      });
    }
    return NextResponse.json({ people, warnings, errors, resolvedDomain, resolvedWebsite });
  } catch (e) {
    return handleApiError(e, "[api/scout/people]");
  }
}

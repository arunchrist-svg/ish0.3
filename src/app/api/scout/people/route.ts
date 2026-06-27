import { NextResponse } from "next/server";
import { requireTenantContext, UnauthorizedError } from "@/lib/tenant";
import { assertCredits, deductCredits, InsufficientCreditsError } from "@/lib/billing/credits";
import { discoverPeople } from "@/lib/enrichment/waterfall";
import type { DataMode } from "@/lib/enrichment/types";
import { getResolvedWorkspaceEnrichmentConfig } from "@/lib/settings/workspace-settings";
import { requirePipelineWrite } from "@/lib/auth/permissions";

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

    const limit = Math.min(requestedLimit ?? cfg.scoutLeadsLimit, 25);
    await assertCredits(ctx.tenantId, "scout.contact", limit);

    const { people, warnings, errors } = await discoverPeople({
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
    });

    if (people.length > 0) {
      await deductCredits({ tenantId: ctx.tenantId, action: "scout.contact", quantity: people.length, referenceId: `scout-people-${Date.now()}` });
    }
    return NextResponse.json({ people, warnings, errors });
  } catch (e) {
    console.error("[api/scout/people]", e);
    return NextResponse.json({ error: "People discovery failed" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { saveScoutCompanies, saveScoutLeads } from "@/lib/scout/save-leads";
import type { ScoutPersonResult, ScoutCompanyResult, DataMode } from "@/lib/enrichment/types";
import { requirePipelineWrite } from "@/lib/auth/permissions";
import { getResolvedWorkspaceEnrichmentConfig } from "@/lib/settings/workspace-settings";
import { handleApiError } from "@/lib/api-errors";

export async function POST(req: Request) {
  try {
    const ctx = await requireTenantContext();
    requirePipelineWrite(ctx);
    const body = await req.json();
    const {
      people,
      company,
      dataMode: requestedDataMode,
    }: {
      people?: ScoutPersonResult[];
      company: ScoutCompanyResult;
      dataMode?: DataMode;
    } = body;

    if (!company?.name) {
      return NextResponse.json({ error: "company required" }, { status: 400 });
    }

    const peopleList = Array.isArray(people) ? people : [];
    if (peopleList.length === 0) {
      const result = await saveScoutCompanies({
        companies: [company],
        tenantId: ctx.tenantId,
        workspaceId: ctx.workspaceId,
      });
      return NextResponse.json({
        saved: [],
        skipped: [],
        companySaved: true,
        accountId: result.accounts[0]?.id,
      });
    }

    const dataMode = (requestedDataMode ?? process.env.DEFAULT_DATA_MODE ?? "free") as DataMode;
    const enrichmentConfig = await getResolvedWorkspaceEnrichmentConfig({ dataMode });

    const result = await saveScoutLeads({
      people: peopleList,
      company,
      dataMode,
      enrichmentConfig,
      leadSource: "scout_wizard",
      tenantId: ctx.tenantId,
      workspaceId: ctx.workspaceId,
    });

    return NextResponse.json(result);
  } catch (e) {
    const err = handleApiError(e, "[api/scout/save]");
    if (err.status !== 500) return err;
    return NextResponse.json({ error: "Save failed" }, { status: 500 });
  }
}

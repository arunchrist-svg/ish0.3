import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { saveScoutLeads } from "@/lib/scout/save-leads";
import type { ScoutPersonResult, ScoutCompanyResult, DataMode } from "@/lib/enrichment/types";
import { requirePipelineWrite } from "@/lib/auth/permissions";
import { getResolvedWorkspaceEnrichmentConfig } from "@/lib/settings/workspace-settings";

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
      people: ScoutPersonResult[];
      company: ScoutCompanyResult;
      dataMode?: DataMode;
    } = body;

    if (!people?.length || !company?.name) {
      return NextResponse.json({ error: "people and company required" }, { status: 400 });
    }

    const dataMode = (requestedDataMode ?? process.env.DEFAULT_DATA_MODE ?? "free") as DataMode;
    const enrichmentConfig = await getResolvedWorkspaceEnrichmentConfig({ dataMode });

    const result = await saveScoutLeads({
      people,
      company,
      dataMode,
      enrichmentConfig,
      leadSource: "scout_wizard",
      tenantId: ctx.tenantId,
      workspaceId: ctx.workspaceId,
    });

    return NextResponse.json(result);
  } catch (e) {
    console.error("[api/scout/save]", e);
    return NextResponse.json({ error: "Save failed" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { saveScoutLeads } from "@/lib/scout/save-leads";
import type { ScoutPersonResult, ScoutCompanyResult, DataMode } from "@/lib/enrichment/types";

export async function POST(req: Request) {
  try {
    const ctx = await requireTenantContext();
    const body = await req.json();
    const { people, company }: { people: ScoutPersonResult[]; company: ScoutCompanyResult } = body;

    if (!people?.length || !company?.name) {
      return NextResponse.json({ error: "people and company required" }, { status: 400 });
    }

    const dataMode = (process.env.DEFAULT_DATA_MODE ?? "free") as DataMode;
    const result = await saveScoutLeads({ people, company, dataMode, leadSource: "scout_wizard", tenantId: ctx.tenantId, workspaceId: ctx.workspaceId });

    return NextResponse.json(result);
  } catch (e) {
    console.error("[api/scout/save]", e);
    return NextResponse.json({ error: "Save failed" }, { status: 500 });
  }
}

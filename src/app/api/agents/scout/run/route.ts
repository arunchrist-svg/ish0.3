import { NextResponse } from "next/server";
import { runScoutBatch } from "@/lib/agents/scout";
import { requireTenantContext } from "@/lib/tenant";
import type { DataMode } from "@/lib/enrichment/types";
import { handleApiError } from "@/lib/api-errors";

export async function POST(req: Request) {
  try {
    const ctx = await requireTenantContext();
    const body = await req.json().catch(() => ({}));
    const {
      cities,
      industries,
      dataMode = (process.env.DEFAULT_DATA_MODE ?? "free") as DataMode,
      companyLimit,
      maxCompaniesToProcess,
    } = body;

    const result = await runScoutBatch({
      tenantId: ctx.tenantId,
      workspaceId: ctx.workspaceId,
      cities,
      industries,
      dataMode,
      companyLimit,
      maxCompaniesToProcess,
    });

    return NextResponse.json(result);
  } catch (e) {
    return handleApiError(e, "[api/agents/scout/run]");
  }
}

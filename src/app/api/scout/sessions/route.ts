import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { handleApiError } from "@/lib/api-errors";
import {
  createScoutSession,
  listScoutSessions,
  type ScoutSessionMode,
} from "@/lib/scout/sessions";
import type { ScoutSessionFilters, ScoutSessionPerson, ScoutSessionUiState } from "@/db";
import type { ScoutCompanyResult } from "@/lib/enrichment/types";

export async function GET() {
  try {
    const ctx = await requireTenantContext();
    const sessions = await listScoutSessions({
      tenantId: ctx.tenantId,
      workspaceId: ctx.workspaceId,
    });
    return NextResponse.json({ sessions });
  } catch (e) {
    const err = handleApiError(e, "[api/scout/sessions]");
    if (err.status !== 500) return err;
    return NextResponse.json({ error: "Could not load scout sessions" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireTenantContext();
    const body = (await req.json()) as {
      mode?: ScoutSessionMode;
      filters?: ScoutSessionFilters;
      companies?: ScoutCompanyResult[];
      people?: ScoutSessionPerson[];
      uiState?: ScoutSessionUiState;
      warnings?: string[];
      title?: string;
    };

    if (!body.filters || !Array.isArray(body.filters.cities)) {
      return NextResponse.json({ error: "filters.cities is required" }, { status: 400 });
    }

    const session = await createScoutSession({
      tenantId: ctx.tenantId,
      workspaceId: ctx.workspaceId,
      createdByUserId: ctx.userId,
      mode: body.mode === "search" ? "search" : "autopilot",
      filters: body.filters,
      companies: body.companies,
      people: body.people,
      uiState: body.uiState,
      warnings: body.warnings,
      title: body.title,
    });

    return NextResponse.json({ session }, { status: 201 });
  } catch (e) {
    const err = handleApiError(e, "[api/scout/sessions POST]");
    if (err.status !== 500) return err;
    return NextResponse.json({ error: "Could not create scout session" }, { status: 500 });
  }
}

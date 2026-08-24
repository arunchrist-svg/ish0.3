import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { handleApiError } from "@/lib/api-errors";
import {
  deleteScoutSession,
  getScoutSession,
  updateScoutSession,
  type ScoutSessionMode,
} from "@/lib/scout/sessions";
import type { ScoutSessionFilters, ScoutSessionPerson, ScoutSessionUiState } from "@/db";
import type { ScoutCompanyResult } from "@/lib/enrichment/types";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: RouteParams) {
  try {
    const ctx = await requireTenantContext();
    const { id } = await params;
    const session = await getScoutSession({
      tenantId: ctx.tenantId,
      workspaceId: ctx.workspaceId,
      id,
    });
    if (!session) {
      return NextResponse.json({ error: "Scout session not found" }, { status: 404 });
    }
    return NextResponse.json({ session });
  } catch (e) {
    const err = handleApiError(e, "[api/scout/sessions/:id GET]");
    if (err.status !== 500) return err;
    return NextResponse.json({ error: "Could not load scout session" }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: RouteParams) {
  try {
    const ctx = await requireTenantContext();
    const { id } = await params;
    const body = (await req.json()) as {
      mode?: ScoutSessionMode;
      filters?: ScoutSessionFilters;
      companies?: ScoutCompanyResult[];
      people?: ScoutSessionPerson[];
      uiState?: ScoutSessionUiState;
      warnings?: string[];
      title?: string;
    };

    const session = await updateScoutSession({
      tenantId: ctx.tenantId,
      workspaceId: ctx.workspaceId,
      id,
      mode: body.mode,
      filters: body.filters,
      companies: body.companies,
      people: body.people,
      uiState: body.uiState,
      warnings: body.warnings,
      title: body.title,
    });

    if (!session) {
      return NextResponse.json({ error: "Scout session not found" }, { status: 404 });
    }
    return NextResponse.json({ session });
  } catch (e) {
    const err = handleApiError(e, "[api/scout/sessions/:id PATCH]");
    if (err.status !== 500) return err;
    return NextResponse.json({ error: "Could not update scout session" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: RouteParams) {
  try {
    const ctx = await requireTenantContext();
    const { id } = await params;
    const ok = await deleteScoutSession({
      tenantId: ctx.tenantId,
      workspaceId: ctx.workspaceId,
      id,
    });
    if (!ok) {
      return NextResponse.json({ error: "Scout session not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const err = handleApiError(e, "[api/scout/sessions/:id DELETE]");
    if (err.status !== 500) return err;
    return NextResponse.json({ error: "Could not delete scout session" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { requireTenantContext, ForbiddenError } from "@/lib/tenant";
import { canManageSettings } from "@/lib/auth/permissions";
import { handleApiError } from "@/lib/api-errors";
import type { EnrichmentConfig } from "@/lib/enrichment/config";
import {
  getResolvedWorkspaceEnrichmentConfig,
  saveWorkspaceEnrichmentOverrides,
} from "@/lib/settings/workspace-settings";

export async function GET() {
  try {
    const ctx = await requireTenantContext();
    if (!canManageSettings(ctx.role, ctx.platformRole)) throw new ForbiddenError('Admin access required');
    const config = await getResolvedWorkspaceEnrichmentConfig();
    return NextResponse.json(config);
  } catch (e) {
    const err = handleApiError(e, '[settings]');
    if (err.status !== 500) return err;
    console.error("[api/settings] GET failed:", e);
    return NextResponse.json({ error: "Failed to load settings" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireTenantContext();
    if (!canManageSettings(ctx.role, ctx.platformRole)) throw new ForbiddenError('Admin access required');
    const body = (await req.json()) as Partial<EnrichmentConfig>;
    const config = await saveWorkspaceEnrichmentOverrides(body);
    return NextResponse.json({ ok: true, config });
  } catch (e) {
    console.error("[api/settings] POST failed:", e);
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
  }
}

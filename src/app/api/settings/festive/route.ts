import { NextResponse } from "next/server";
import { db, workspaceSettings } from "@/db";
import { eq } from "drizzle-orm";
import { requireTenantContext, ForbiddenError } from "@/lib/tenant";
import { canManageSettings } from "@/lib/auth/permissions";
import { handleApiError } from "@/lib/api-errors";

export type FestiveSettings = {
  festiveTarget: number;
  festiveCapacity: number;
  whatsAppFirst: boolean;
};

async function load(workspaceId: string): Promise<FestiveSettings> {
  const row = await db.query.workspaceSettings.findFirst({
    where: eq(workspaceSettings.workspaceId, workspaceId),
  });
  const cfg = (row?.enrichmentConfig ?? {}) as Record<string, unknown>;
  const flags = (cfg.agentFlags ?? {}) as Record<string, unknown>;
  return {
    festiveTarget: Number(cfg.festiveTarget) || 0,
    festiveCapacity: Number(cfg.festiveCapacity) || 0,
    whatsAppFirst: Boolean(flags.whatsAppFirst),
  };
}

export async function GET() {
  try {
    const ctx = await requireTenantContext();
    if (!canManageSettings(ctx.role, ctx.platformRole)) throw new ForbiddenError("Admin required");
    return NextResponse.json(await load(ctx.workspaceId));
  } catch (e) {
    return handleApiError(e, "[api/settings/festive]");
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireTenantContext();
    if (!canManageSettings(ctx.role, ctx.platformRole)) throw new ForbiddenError("Admin required");

    const body = (await req.json()) as Partial<FestiveSettings>;

    const row = await db.query.workspaceSettings.findFirst({
      where: eq(workspaceSettings.workspaceId, ctx.workspaceId),
    });
    const existing = (row?.enrichmentConfig ?? {}) as Record<string, unknown>;
    const existingFlags = (existing.agentFlags ?? {}) as Record<string, unknown>;

    const merged = {
      ...existing,
      ...(body.festiveTarget !== undefined ? { festiveTarget: body.festiveTarget } : {}),
      ...(body.festiveCapacity !== undefined ? { festiveCapacity: body.festiveCapacity } : {}),
      agentFlags: {
        ...existingFlags,
        ...(body.whatsAppFirst !== undefined ? { whatsAppFirst: body.whatsAppFirst } : {}),
      },
    };

    await db
      .insert(workspaceSettings)
      .values({ workspaceId: ctx.workspaceId, enrichmentConfig: merged, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: workspaceSettings.workspaceId,
        set: { enrichmentConfig: merged, updatedAt: new Date() },
      });

    return NextResponse.json(await load(ctx.workspaceId));
  } catch (e) {
    return handleApiError(e, "[api/settings/festive]");
  }
}

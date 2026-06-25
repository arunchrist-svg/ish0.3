import { NextResponse } from "next/server";
import { db, tenants, workspaceSettings, workspaces } from "@/db";
import { eq } from "drizzle-orm";
import { requireSuperadmin } from "@/lib/tenant";
import { handleApiError } from "@/lib/api-errors";
import { invalidateEmailConfigCache } from "@/lib/email/email-sender";

export async function POST(req: Request) {
  try {
    await requireSuperadmin();
    const { tenantId, demoMode } = (await req.json()) as { tenantId?: string; demoMode?: boolean };
    if (!tenantId || typeof demoMode !== "boolean") {
      return NextResponse.json({ error: "tenantId and demoMode required" }, { status: 400 });
    }

    await db.update(tenants).set({ demoMode }).where(eq(tenants.id, tenantId));

    const [workspace] = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.tenantId, tenantId))
      .limit(1);

    if (workspace) {
      const [settings] = await db
        .select()
        .from(workspaceSettings)
        .where(eq(workspaceSettings.workspaceId, workspace.id))
        .limit(1);

      const emailConfig = {
        ...((settings?.emailConfig as object) ?? {}),
        sendMode: demoMode ? "dry_run" : "test",
      };

      await db
        .insert(workspaceSettings)
        .values({ workspaceId: workspace.id, emailConfig, enrichmentConfig: settings?.enrichmentConfig ?? {} })
        .onConflictDoUpdate({
          target: workspaceSettings.workspaceId,
          set: { emailConfig, updatedAt: new Date() },
        });
      invalidateEmailConfigCache();
    }

    return NextResponse.json({ ok: true, demoMode });
  } catch (e) {
    return handleApiError(e, "[admin/demo]");
  }
}

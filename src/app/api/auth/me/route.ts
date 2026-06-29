import { NextResponse } from "next/server";
import { requireTenantContext, UnauthorizedError } from "@/lib/tenant";
import { getCreditBalance } from "@/lib/billing/credits";
import { getResolvedEmailConfig } from "@/lib/settings/email-settings";
import { getPermissionFlags } from "@/lib/auth/permissions";
import { db, tenants, users } from "@/db";
import { eq } from "drizzle-orm";

export async function GET() {
  try {
    const ctx = await requireTenantContext();

    const [user, tenant, credits, emailConfig] = await Promise.all([
      db
        .select({ id: users.id, email: users.email, name: users.name })
        .from(users)
        .where(eq(users.id, ctx.userId))
        .limit(1)
        .then((rows) => rows[0]),
      db.select().from(tenants).where(eq(tenants.id, ctx.tenantId)).limit(1).then((rows) => rows[0]),
      getCreditBalance(ctx.tenantId),
      getResolvedEmailConfig(ctx.workspaceId),
    ]);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const permissions = getPermissionFlags(ctx);

    return NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name },
      tenant: {
        id: ctx.tenantId,
        name: tenant?.name,
        slug: ctx.tenantSlug,
        plan: tenant?.plan,
        demoMode: ctx.demoMode,
        onboardingStatus: ctx.onboardingStatus,
        onboardingStep: ctx.onboardingStep,
      },
      workspaceId: ctx.workspaceId,
      role: ctx.role,
      platformRole: ctx.platformRole,
      isSuperadmin: ctx.isSuperadmin,
      mustChangePassword: ctx.mustChangePassword,
      permissions,
      sendMode: emailConfig.sendMode,
      credits,
    });
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[auth/me]", e);
    return NextResponse.json({ error: "Failed to load session" }, { status: 500 });
  }
}

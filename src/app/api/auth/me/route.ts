import { NextResponse } from "next/server";
import { getSessionTokenFromCookies, getSessionUser } from "@/lib/auth/session";
import { requireTenantContext, UnauthorizedError } from "@/lib/tenant";
import { getCreditBalance } from "@/lib/billing/credits";
import { getResolvedEmailConfig } from "@/lib/settings/email-settings";
import { canManageTeam } from "@/lib/auth/platform";
import { db, tenants } from "@/db";
import { eq } from "drizzle-orm";

export async function GET() {
  try {
    const token = await getSessionTokenFromCookies();
    const user = await getSessionUser(token);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ctx = await requireTenantContext();
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, ctx.tenantId)).limit(1);
    const credits = await getCreditBalance(ctx.tenantId);
    const emailConfig = await getResolvedEmailConfig(ctx.workspaceId);

    return NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name },
      tenant: {
        id: ctx.tenantId,
        name: tenant?.name,
        plan: tenant?.plan,
        demoMode: ctx.demoMode,
        onboardingStatus: ctx.onboardingStatus,
        onboardingStep: ctx.onboardingStep,
      },
      workspaceId: ctx.workspaceId,
      role: ctx.role,
      platformRole: ctx.platformRole,
      isSuperadmin: ctx.isSuperadmin,
      canManageTeam: canManageTeam(ctx.role, ctx.platformRole),
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

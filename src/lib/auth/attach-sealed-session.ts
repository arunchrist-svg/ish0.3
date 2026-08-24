import type { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, orgMembers, tenants, workspaces } from "@/db";
import {
  SEALED_SESSION_COOKIE,
  sealTenantClaims,
  sealedSessionCookieOptions,
} from "@/lib/auth/sealed-session";

/** Attach HMAC sealed tenant claims after login/session create (when tenant is known). */
export async function attachSealedSessionCookie(
  res: NextResponse,
  params: {
    userId: string;
    tenantId: string | null | undefined;
    platformRole?: string | null;
    mustChangePassword?: boolean;
  },
): Promise<void> {
  if (!params.tenantId) return;

  const [membership] = await db
    .select({
      role: orgMembers.role,
      onboardingStatus: tenants.onboardingStatus,
      onboardingStep: tenants.onboardingStep,
      demoMode: tenants.demoMode,
      tenantSlug: tenants.slug,
    })
    .from(orgMembers)
    .innerJoin(tenants, eq(tenants.id, orgMembers.tenantId))
    .where(and(eq(orgMembers.userId, params.userId), eq(orgMembers.tenantId, params.tenantId)))
    .limit(1);

  if (!membership) return;

  const [workspace] = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.tenantId, params.tenantId))
    .limit(1);

  if (!workspace) return;

  const sealed = sealTenantClaims({
    userId: params.userId,
    tenantId: params.tenantId,
    workspaceId: workspace.id,
    role: membership.role,
    platformRole: params.platformRole ?? "user",
    tenantSlug: membership.tenantSlug,
    onboardingStatus: membership.onboardingStatus,
    onboardingStep: membership.onboardingStep,
    demoMode: membership.demoMode,
    mustChangePassword: params.mustChangePassword ?? false,
  });
  res.cookies.set(SEALED_SESSION_COOKIE, sealed, sealedSessionCookieOptions(sealed));
}

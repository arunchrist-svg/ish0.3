import { db, orgMembers, tenants, users, workspaces } from "@/db";
import { eq } from "drizzle-orm";
import { getSessionTokenFromCookies, getSessionUser } from "@/lib/auth/session";
import { isSuperadmin } from "@/lib/auth/platform";

export type TenantRole = "owner" | "admin" | "member" | "viewer";

export type TenantContext = {
  userId: string;
  tenantId: string;
  workspaceId: string;
  role: TenantRole;
  platformRole: string;
  isSuperadmin: boolean;
  onboardingStatus: string;
  onboardingStep: number;
  demoMode: boolean;
};

export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export async function requireTenantContext(): Promise<TenantContext> {
  const token = await getSessionTokenFromCookies();
  const user = await getSessionUser(token);
  if (!user) throw new UnauthorizedError();

  const [platformUser] = await db
    .select({ platformRole: users.platformRole })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  const platformRole = platformUser?.platformRole ?? "user";

  const [membership] = await db
    .select({
      tenantId: orgMembers.tenantId,
      role: orgMembers.role,
      onboardingStatus: tenants.onboardingStatus,
      onboardingStep: tenants.onboardingStep,
      demoMode: tenants.demoMode,
    })
    .from(orgMembers)
    .innerJoin(tenants, eq(tenants.id, orgMembers.tenantId))
    .where(eq(orgMembers.userId, user.id))
    .limit(1);

  if (!membership) throw new UnauthorizedError("No organization membership");

  const [workspace] = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.tenantId, membership.tenantId))
    .limit(1);

  if (!workspace) throw new UnauthorizedError("No workspace found");

  return {
    userId: user.id,
    tenantId: membership.tenantId,
    workspaceId: workspace.id,
    role: membership.role as TenantRole,
    platformRole,
    isSuperadmin: isSuperadmin(platformRole),
    onboardingStatus: membership.onboardingStatus,
    onboardingStep: membership.onboardingStep,
    demoMode: membership.demoMode,
  };
}

export async function requireSuperadmin(): Promise<{ userId: string; email: string }> {
  const token = await getSessionTokenFromCookies();
  const user = await getSessionUser(token);
  if (!user) throw new UnauthorizedError();

  const [row] = await db
    .select({ platformRole: users.platformRole })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  if (!isSuperadmin(row?.platformRole)) throw new ForbiddenError("Superadmin required");
  return { userId: user.id, email: user.email };
}

/** @deprecated Use requireTenantContext() */
export async function getDefaultTenantContext(): Promise<{ tenantId: string; workspaceId: string }> {
  const ctx = await requireTenantContext();
  return { tenantId: ctx.tenantId, workspaceId: ctx.workspaceId };
}

export async function assertResourceTenant(resourceTenantId: string, ctx: TenantContext): Promise<void> {
  if (resourceTenantId !== ctx.tenantId) throw new ForbiddenError();
}

import { db, orgMembers, tenants, users, workspaces, sessions } from "@/db";
import { and, eq } from "drizzle-orm";
import { getSessionTokenFromCookies, getSessionRecord } from "@/lib/auth/session";
import { isSuperadmin } from "@/lib/auth/platform";

export type TenantRole = "owner" | "admin" | "member" | "viewer";
export type MemberStatus = "active" | "disabled";

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
  tenantSlug: string;
  mustChangePassword: boolean;
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

export class WorkspaceAmbiguousError extends Error {
  code = "WORKSPACE_AMBIGUOUS" as const;
  slugs: { slug: string; name: string }[];

  constructor(slugs: { slug: string; name: string }[]) {
    super("Multiple organizations match this email. Provide your organization slug.");
    this.name = "WorkspaceAmbiguousError";
    this.slugs = slugs;
  }
}

async function loadMembership(userId: string, tenantId: string) {
  const [membership] = await db
    .select({
      tenantId: orgMembers.tenantId,
      role: orgMembers.role,
      status: orgMembers.status,
      onboardingStatus: tenants.onboardingStatus,
      onboardingStep: tenants.onboardingStep,
      demoMode: tenants.demoMode,
      tenantSlug: tenants.slug,
      tenantName: tenants.name,
    })
    .from(orgMembers)
    .innerJoin(tenants, eq(tenants.id, orgMembers.tenantId))
    .where(and(eq(orgMembers.userId, userId), eq(orgMembers.tenantId, tenantId)))
    .limit(1);

  if (!membership || membership.status === "disabled") return null;
  return membership;
}

export async function listActiveMemberships(userId: string) {
  return db
    .select({
      tenantId: orgMembers.tenantId,
      role: orgMembers.role,
      slug: tenants.slug,
      name: tenants.name,
    })
    .from(orgMembers)
    .innerJoin(tenants, eq(tenants.id, orgMembers.tenantId))
    .where(and(eq(orgMembers.userId, userId), eq(orgMembers.status, "active")));
}

export async function requireTenantContext(): Promise<TenantContext> {
  const token = await getSessionTokenFromCookies();
  const session = await getSessionRecord(token);
  if (!session) throw new UnauthorizedError();

  const [platformUser] = await db
    .select({ platformRole: users.platformRole, mustChangePassword: users.mustChangePassword })
    .from(users)
    .where(eq(users.id, session.id))
    .limit(1);

  const platformRole = platformUser?.platformRole ?? "user";
  const mustChangePassword = platformUser?.mustChangePassword ?? false;

  let tenantId = session.tenantId;
  if (!tenantId) {
    const memberships = await listActiveMemberships(session.id);
    if (memberships.length === 0) throw new UnauthorizedError("No organization membership");
    if (memberships.length > 1) {
      throw new WorkspaceAmbiguousError(
        memberships.map((m) => ({ slug: m.slug, name: m.name })),
      );
    }
    tenantId = memberships[0]!.tenantId;
    if (token) {
      await db.update(sessions).set({ tenantId }).where(eq(sessions.token, token));
    }
  }

  const membership = await loadMembership(session.id, tenantId);
  if (!membership) throw new UnauthorizedError("No organization membership");

  const [workspace] = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.tenantId, membership.tenantId))
    .limit(1);

  if (!workspace) throw new UnauthorizedError("No workspace found");

  return {
    userId: session.id,
    tenantId: membership.tenantId,
    workspaceId: workspace.id,
    role: membership.role as TenantRole,
    platformRole,
    isSuperadmin: isSuperadmin(platformRole),
    onboardingStatus: membership.onboardingStatus,
    onboardingStep: membership.onboardingStep,
    demoMode: membership.demoMode,
    tenantSlug: membership.tenantSlug,
    mustChangePassword,
  };
}

export async function requireSuperadmin(): Promise<{ userId: string; email: string }> {
  const token = await getSessionTokenFromCookies();
  const session = await getSessionRecord(token);
  if (!session) throw new UnauthorizedError();

  const [row] = await db
    .select({ platformRole: users.platformRole })
    .from(users)
    .where(eq(users.id, session.id))
    .limit(1);

  if (!isSuperadmin(row?.platformRole)) throw new ForbiddenError("Superadmin required");
  return { userId: session.id, email: session.email };
}

/** @deprecated Use requireTenantContext() */
export async function getDefaultTenantContext(): Promise<{ tenantId: string; workspaceId: string }> {
  const ctx = await requireTenantContext();
  return { tenantId: ctx.tenantId, workspaceId: ctx.workspaceId };
}

export async function assertResourceTenant(resourceTenantId: string, ctx: TenantContext): Promise<void> {
  if (resourceTenantId !== ctx.tenantId) throw new ForbiddenError();
}

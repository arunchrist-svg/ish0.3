import { cache } from "react";
import { cookies } from "next/headers";
import { db, orgMembers, tenants, workspaces, sessions } from "@/db";
import { and, eq } from "drizzle-orm";
import { getSessionTokenFromCookies, getSessionRecord } from "@/lib/auth/session";
import { isSuperadmin } from "@/lib/auth/platform";
import {
  SEALED_SESSION_COOKIE,
  unsealTenantClaims,
  type SealedTenantClaims,
} from "@/lib/auth/sealed-session";

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

const TENANT_CTX_TTL_MS = 60_000;
const tenantCtxCache = new Map<string, { ctx: TenantContext; expiresAt: number }>();

export function clearTenantContextCache() {
  tenantCtxCache.clear();
}

function claimsToContext(claims: SealedTenantClaims): TenantContext {
  return {
    userId: claims.userId,
    tenantId: claims.tenantId,
    workspaceId: claims.workspaceId,
    role: claims.role as TenantRole,
    platformRole: claims.platformRole,
    isSuperadmin: isSuperadmin(claims.platformRole),
    onboardingStatus: claims.onboardingStatus,
    onboardingStep: claims.onboardingStep,
    demoMode: claims.demoMode,
    tenantSlug: claims.tenantSlug,
    mustChangePassword: claims.mustChangePassword,
  };
}

export function tenantContextToSealClaims(ctx: TenantContext): Omit<SealedTenantClaims, "exp"> {
  return {
    userId: ctx.userId,
    tenantId: ctx.tenantId,
    workspaceId: ctx.workspaceId,
    role: ctx.role,
    platformRole: ctx.platformRole,
    tenantSlug: ctx.tenantSlug,
    onboardingStatus: ctx.onboardingStatus,
    onboardingStep: ctx.onboardingStep,
    demoMode: ctx.demoMode,
    mustChangePassword: ctx.mustChangePassword,
  };
}

async function loadTenantContextFromDb(): Promise<TenantContext> {
  const token = await getSessionTokenFromCookies();
  if (token) {
    const cached = tenantCtxCache.get(token);
    if (cached && cached.expiresAt > Date.now()) return cached.ctx;
  }

  const session = await getSessionRecord(token);
  if (!session) throw new UnauthorizedError();

  const platformRole = session.platformRole ?? "user";
  const mustChangePassword = session.mustChangePassword;

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

  const [membership, workspaceRows] = await Promise.all([
    loadMembership(session.id, tenantId),
    db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.tenantId, tenantId))
      .limit(1),
  ]);
  if (!membership) throw new UnauthorizedError("No organization membership");
  const workspace = workspaceRows[0];
  if (!workspace) throw new UnauthorizedError("No workspace found");

  const ctx: TenantContext = {
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
  if (token) {
    tenantCtxCache.set(token, { ctx, expiresAt: Date.now() + TENANT_CTX_TTL_MS });
  }
  return ctx;
}

async function loadTenantContext(): Promise<TenantContext> {
  const cookieStore = await cookies();
  const sealed = unsealTenantClaims(cookieStore.get(SEALED_SESSION_COOKIE)?.value);
  if (sealed) {
    const sessionToken = await getSessionTokenFromCookies();
    // Still require a session cookie so logout/revocation works.
    if (sessionToken) {
      const cacheKey = `seal:${sessionToken}`;
      const cached = tenantCtxCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) return cached.ctx;
      const ctx = claimsToContext(sealed);
      tenantCtxCache.set(cacheKey, { ctx, expiresAt: Date.now() + TENANT_CTX_TTL_MS });
      return ctx;
    }
  }
  return loadTenantContextFromDb();
}

const requireTenantContextImpl = cache(loadTenantContext);

export async function requireTenantContext(): Promise<TenantContext> {
  return requireTenantContextImpl();
}

/** Force DB resolution (e.g. after org switch). */
export async function requireTenantContextFresh(): Promise<TenantContext> {
  clearTenantContextCache();
  return loadTenantContextFromDb();
}

export async function requireSuperadmin(): Promise<{ userId: string; email: string }> {
  const token = await getSessionTokenFromCookies();
  const session = await getSessionRecord(token);
  if (!session) throw new UnauthorizedError();

  if (!isSuperadmin(session.platformRole)) throw new ForbiddenError("Superadmin required");
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

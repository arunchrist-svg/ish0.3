import type { TenantContext, TenantRole } from "@/lib/tenant";
import { ForbiddenError } from "@/lib/tenant";
import { isSuperadmin } from "@/lib/auth/platform";

export function canViewPlatformKeys(platformRole?: string | null): boolean {
  return isSuperadmin(platformRole);
}

export function canManageBilling(role: TenantRole, platformRole?: string | null): boolean {
  if (isSuperadmin(platformRole)) return true;
  return role === "owner";
}

/** Tenant owner or platform superadmin. Slug admins (tenant role admin) cannot access these areas. */
export function canManageOwnerSettings(role: TenantRole, platformRole?: string | null): boolean {
  if (isSuperadmin(platformRole)) return true;
  return role === "owner";
}

export function canManageEmailSettings(role: TenantRole, platformRole?: string | null): boolean {
  if (isSuperadmin(platformRole)) return true;
  return role === "owner" || role === "admin";
}

export function canManageIntegrations(role: TenantRole, platformRole?: string | null): boolean {
  return canManageOwnerSettings(role, platformRole);
}

export function canManageTeam(role: TenantRole, platformRole?: string | null): boolean {
  if (isSuperadmin(platformRole)) return true;
  return role === "owner" || role === "admin";
}

export function canManageSettings(role: TenantRole, platformRole?: string | null): boolean {
  if (isSuperadmin(platformRole)) return true;
  return role === "owner" || role === "admin";
}

export function canWritePipeline(role: TenantRole, platformRole?: string | null): boolean {
  if (isSuperadmin(platformRole)) return true;
  return role === "owner" || role === "admin" || role === "member";
}

export function isReadOnly(role: TenantRole): boolean {
  return role === "viewer";
}

export function canChangeMemberRole(actorRole: TenantRole, targetRole: TenantRole): boolean {
  if (targetRole === "owner") return false;
  if (actorRole === "owner") return true;
  if (actorRole === "admin") return targetRole === "member" || targetRole === "viewer";
  return false;
}

export function requirePipelineWrite(ctx: TenantContext): void {
  if (!canWritePipeline(ctx.role, ctx.platformRole)) {
    throw new ForbiddenError("Read-only access");
  }
}

export function getPermissionFlags(ctx: TenantContext) {
  return {
    canManageBilling: canManageBilling(ctx.role, ctx.platformRole),
    canManageEmail: canManageEmailSettings(ctx.role, ctx.platformRole),
    canManageIntegrations: canManageIntegrations(ctx.role, ctx.platformRole),
    canManageTeam: canManageTeam(ctx.role, ctx.platformRole),
    canManageSettings: canManageSettings(ctx.role, ctx.platformRole),
    canWritePipeline: canWritePipeline(ctx.role, ctx.platformRole),
    isReadOnly: isReadOnly(ctx.role),
  };
}

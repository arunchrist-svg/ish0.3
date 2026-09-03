import { and, eq, type SQL } from "drizzle-orm";
import { leads } from "@/db";
import type { TenantContext, TenantRole } from "@/lib/tenant";
import { isSuperadmin } from "@/lib/auth/platform";

/** Platform superadmin can see every lead in a tenant for support. */
export function canViewAllTenantLeads(platformRole?: string | null): boolean {
  return isSuperadmin(platformRole);
}

/**
 * Owners see all leads in their tenant (needed for team management and
 * "added by" filtering across members). Admins and members only see their
 * own. Superadmin sees all.
 */
export function leadVisibilitySql(ctx: Pick<TenantContext, "userId" | "role" | "platformRole">): SQL | undefined {
  if (canViewAllTenantLeads(ctx.platformRole)) return undefined;
  if (ctx.role === "owner") return undefined;
  return eq(leads.createdByUserId, ctx.userId);
}

export function canAccessLeadRecord(
  ctx: Pick<TenantContext, "userId" | "role" | "platformRole" | "tenantId">,
  lead: { tenantId: string; createdByUserId?: string | null },
): boolean {
  if (lead.tenantId !== ctx.tenantId) return false;
  if (canViewAllTenantLeads(ctx.platformRole)) return true;
  if (ctx.role === "owner") return true;
  return lead.createdByUserId === ctx.userId;
}

export function withLeadVisibility(
  ctx: Pick<TenantContext, "userId" | "role" | "platformRole">,
  ...parts: Array<SQL | undefined>
): SQL {
  const visibility = leadVisibilitySql(ctx);
  const filtered = [...parts, visibility].filter(Boolean) as SQL[];
  if (filtered.length === 1) return filtered[0];
  return and(...filtered)!;
}

export function leadVisibilityForRole(role: TenantRole, platformRole?: string | null): "all" | "own" {
  if (canViewAllTenantLeads(platformRole)) return "all";
  if (role === "owner") return "all";
  return "own";
}

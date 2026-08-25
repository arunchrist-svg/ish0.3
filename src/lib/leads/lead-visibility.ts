import { and, eq, isNull, or, type SQL } from "drizzle-orm";
import { leads } from "@/db";
import type { TenantContext, TenantRole } from "@/lib/tenant";
import { isSuperadmin } from "@/lib/auth/platform";

/** Platform superadmin can see every lead in a tenant for support. */
export function canViewAllTenantLeads(platformRole?: string | null): boolean {
  return isSuperadmin(platformRole);
}

/**
 * Scouted / created leads stay with the user who added them.
 * Slug admins and members only see their own. Owner also sees legacy
 * leads with no created_by (pre-attribution). Superadmin sees all.
 */
export function leadVisibilitySql(ctx: Pick<TenantContext, "userId" | "role" | "platformRole">): SQL | undefined {
  if (canViewAllTenantLeads(ctx.platformRole)) return undefined;
  if (ctx.role === "owner") {
    return or(eq(leads.createdByUserId, ctx.userId), isNull(leads.createdByUserId));
  }
  return eq(leads.createdByUserId, ctx.userId);
}

export function canAccessLeadRecord(
  ctx: Pick<TenantContext, "userId" | "role" | "platformRole" | "tenantId">,
  lead: { tenantId: string; createdByUserId?: string | null },
): boolean {
  if (lead.tenantId !== ctx.tenantId) return false;
  if (canViewAllTenantLeads(ctx.platformRole)) return true;
  if (ctx.role === "owner") {
    return !lead.createdByUserId || lead.createdByUserId === ctx.userId;
  }
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

export function leadVisibilityForRole(role: TenantRole, platformRole?: string | null): "all" | "own_plus_unassigned" | "own" {
  if (canViewAllTenantLeads(platformRole)) return "all";
  if (role === "owner") return "own_plus_unassigned";
  return "own";
}

import { and, eq, type SQL } from "drizzle-orm";
import { leads } from "@/db";
import type { TenantContext, TenantRole } from "@/lib/tenant";

/**
 * Each login only sees leads owned by that mailbox (Scout, Leads, Email).
 * Platform superadmin uses /admin for support, not a shared seller board.
 */
export function leadVisibilitySql(ctx: Pick<TenantContext, "userId">): SQL {
  return eq(leads.createdByUserId, ctx.userId);
}

/** Outbox / send-queue occupancy is always the logged-in mailbox. */
export function mailboxLeadVisibilitySql(ctx: Pick<TenantContext, "userId">): SQL {
  return eq(leads.createdByUserId, ctx.userId);
}

export function canAccessLeadRecord(
  ctx: Pick<TenantContext, "userId" | "tenantId">,
  lead: { tenantId: string; createdByUserId?: string | null },
): boolean {
  if (lead.tenantId !== ctx.tenantId) return false;
  return lead.createdByUserId === ctx.userId;
}

export function withLeadVisibility(
  ctx: Pick<TenantContext, "userId">,
  ...parts: Array<SQL | undefined>
): SQL {
  const visibility = leadVisibilitySql(ctx);
  const filtered = [...parts, visibility].filter(Boolean) as SQL[];
  if (filtered.length === 1) return filtered[0];
  return and(...filtered)!;
}

export function withMailboxLeadVisibility(
  ctx: Pick<TenantContext, "userId">,
  ...parts: Array<SQL | undefined>
): SQL {
  const visibility = mailboxLeadVisibilitySql(ctx);
  const filtered = [...parts, visibility].filter(Boolean) as SQL[];
  if (filtered.length === 1) return filtered[0];
  return and(...filtered)!;
}

export function leadVisibilityForRole(_role: TenantRole, _platformRole?: string | null): "all" | "own" {
  return "own";
}

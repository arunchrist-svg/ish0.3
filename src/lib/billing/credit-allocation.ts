import type { TenantRole } from "@/lib/tenant";

export type CreditScope = "pool" | "user";

export type CreditActor = {
  userId?: string;
  role?: TenantRole;
};

export type UserCreditView = {
  pool: number;
  leftover: number;
  remaining: number | null;
  hasAllocation: boolean;
  canSpendFromLeftover: boolean;
  spendable: number;
};

export function leftoverCredits(pool: number, allocatedRemaining: number): number {
  return Math.max(0, pool - allocatedRemaining);
}

export function canSpendFromLeftover(role?: TenantRole | null, hasAllocation = false): boolean {
  if (hasAllocation) return false;
  return role === "owner" || role === "admin";
}

export function spendableCredits(view: {
  pool: number;
  leftover: number;
  remaining: number | null;
  hasAllocation: boolean;
  canSpendFromLeftover: boolean;
}): number {
  if (view.hasAllocation) return Math.max(0, Math.min(view.remaining ?? 0, view.pool));
  if (view.canSpendFromLeftover) return Math.max(0, Math.min(view.leftover, view.pool));
  return 0;
}

export function buildUserCreditView(params: {
  pool: number;
  allocatedRemaining: number;
  userRemaining: number | null;
  hasAllocation: boolean;
  role?: TenantRole | null;
}): UserCreditView {
  const leftover = leftoverCredits(params.pool, params.allocatedRemaining);
  const canUseLeftover = canSpendFromLeftover(params.role, params.hasAllocation);
  const view = {
    pool: params.pool,
    leftover,
    remaining: params.hasAllocation ? params.userRemaining : null,
    hasAllocation: params.hasAllocation,
    canSpendFromLeftover: canUseLeftover,
    spendable: 0,
  };
  view.spendable = spendableCredits(view);
  return view;
}

export function allocationDeltaFits(params: {
  leftover: number;
  currentRemaining: number;
  nextRemaining: number;
}): { ok: true; delta: number } | { ok: false; delta: number; leftover: number } {
  const delta = params.nextRemaining - params.currentRemaining;
  if (params.nextRemaining < 0) {
    return { ok: false, delta, leftover: params.leftover };
  }
  if (delta > params.leftover) {
    return { ok: false, delta, leftover: params.leftover };
  }
  return { ok: true, delta };
}

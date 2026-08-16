import { db, creditBalances, creditTransactions, usageEvents, userCreditBalances } from "@/db";
import { checkLowBalanceAlerts } from "@/lib/billing/analytics";
import { and, eq, sql } from "drizzle-orm";

import { CREDIT_COSTS } from "@/lib/billing/credit-costs";
import {
  allocationDeltaFits,
  buildUserCreditView,
  type CreditActor,
  type CreditScope,
  type UserCreditView,
} from "@/lib/billing/credit-allocation";
import type { TenantRole } from "@/lib/tenant";

export { CREDIT_COSTS };
export type { CreditActor, CreditScope, UserCreditView };

export function creditActorFrom(ctx: { userId: string; role: TenantRole }): CreditActor {
  return { userId: ctx.userId, role: ctx.role };
}

export class InsufficientCreditsError extends Error {
  required: number;
  available: number;
  scope: CreditScope;

  constructor(required: number, available: number, scope: CreditScope = "pool") {
    super(
      scope === "user"
        ? `Insufficient allocated credits: need ${required}, have ${available}`
        : `Insufficient credits: need ${required}, have ${available}`,
    );
    this.name = "InsufficientCreditsError";
    this.required = required;
    this.available = available;
    this.scope = scope;
  }
}

export class AllocationError extends Error {
  leftover: number;

  constructor(message: string, leftover: number) {
    super(message);
    this.name = "AllocationError";
    this.leftover = leftover;
  }
}

export async function getCreditBalance(tenantId: string): Promise<number> {
  const [row] = await db
    .select({ balance: creditBalances.balance })
    .from(creditBalances)
    .where(eq(creditBalances.tenantId, tenantId))
    .limit(1);
  return row?.balance ?? 0;
}

async function getAllocatedRemainingSum(tenantId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${userCreditBalances.remaining}), 0)::int` })
    .from(userCreditBalances)
    .where(eq(userCreditBalances.tenantId, tenantId));
  return row?.total ?? 0;
}

async function getUserRemainingRow(
  tenantId: string,
  userId: string,
): Promise<{ remaining: number } | null> {
  const [row] = await db
    .select({ remaining: userCreditBalances.remaining })
    .from(userCreditBalances)
    .where(and(eq(userCreditBalances.tenantId, tenantId), eq(userCreditBalances.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function getUserCreditView(params: {
  tenantId: string;
  userId: string;
  role?: TenantRole | null;
}): Promise<UserCreditView> {
  const { tenantId, userId, role } = params;
  const [pool, allocatedRemaining, userRow] = await Promise.all([
    getCreditBalance(tenantId),
    getAllocatedRemainingSum(tenantId),
    getUserRemainingRow(tenantId, userId),
  ]);
  return buildUserCreditView({
    pool,
    allocatedRemaining,
    userRemaining: userRow?.remaining ?? null,
    hasAllocation: Boolean(userRow),
    role,
  });
}

export function requiredCreditsFor(action: string, quantity = 1): number {
  const unitCost = CREDIT_COSTS[action];
  if (!unitCost) return 0;
  return unitCost * quantity;
}

export async function assertCredits(
  tenantId: string,
  action: string,
  quantity = 1,
  actor?: CreditActor,
): Promise<void> {
  const required = requiredCreditsFor(action, quantity);
  if (!required) return;

  const pool = await getCreditBalance(tenantId);
  if (pool < required) {
    throw new InsufficientCreditsError(required, pool, "pool");
  }

  if (!actor?.userId) return;

  const view = await getUserCreditView({
    tenantId,
    userId: actor.userId,
    role: actor.role,
  });
  if (view.spendable < required) {
    throw new InsufficientCreditsError(
      required,
      view.spendable,
      view.hasAllocation || !view.canSpendFromLeftover ? "user" : "pool",
    );
  }
}

export async function deductCredits(params: {
  tenantId: string;
  action: string;
  quantity?: number;
  referenceId?: string;
  idempotencyKey?: string;
  userId?: string;
  role?: TenantRole;
}): Promise<number> {
  const { tenantId, action, quantity = 1, referenceId, idempotencyKey, userId, role } = params;
  const unitCost = CREDIT_COSTS[action];
  if (!unitCost) return await getCreditBalance(tenantId);

  const amount = -(unitCost * quantity);
  const required = Math.abs(amount);

  if (idempotencyKey) {
    const existing = await db.query.creditTransactions.findFirst({
      where: (t, { eq: eqCol }) => eqCol(t.idempotencyKey, idempotencyKey),
    });
    if (existing) return await getCreditBalance(tenantId);
  }

  await db.transaction(async (tx) => {
    const [balance] = await tx
      .select()
      .from(creditBalances)
      .where(eq(creditBalances.tenantId, tenantId))
      .limit(1);

    const current = balance?.balance ?? 0;
    if (current < required) {
      throw new InsufficientCreditsError(required, current, "pool");
    }

    let chargeUserSlice = false;
    if (userId) {
      const [userRow] = await tx
        .select()
        .from(userCreditBalances)
        .where(and(eq(userCreditBalances.tenantId, tenantId), eq(userCreditBalances.userId, userId)))
        .limit(1);

      const [sumRow] = await tx
        .select({ total: sql<number>`coalesce(sum(${userCreditBalances.remaining}), 0)::int` })
        .from(userCreditBalances)
        .where(eq(userCreditBalances.tenantId, tenantId));
      const view = buildUserCreditView({
        pool: current,
        allocatedRemaining: sumRow?.total ?? 0,
        userRemaining: userRow?.remaining ?? null,
        hasAllocation: Boolean(userRow),
        role,
      });
      if (view.spendable < required) {
        throw new InsufficientCreditsError(
          required,
          view.spendable,
          view.hasAllocation || !view.canSpendFromLeftover ? "user" : "pool",
        );
      }
      chargeUserSlice = Boolean(userRow);
    }

    await tx
      .update(creditBalances)
      .set({ balance: sql`${creditBalances.balance} + ${amount}`, updatedAt: new Date() })
      .where(eq(creditBalances.tenantId, tenantId));

    if (chargeUserSlice && userId) {
      await tx
        .update(userCreditBalances)
        .set({
          remaining: sql`${userCreditBalances.remaining} + ${amount}`,
          updatedAt: new Date(),
        })
        .where(and(eq(userCreditBalances.tenantId, tenantId), eq(userCreditBalances.userId, userId)));
    }

    await tx.insert(creditTransactions).values({
      tenantId,
      userId: userId ?? null,
      amount,
      action,
      referenceId,
      idempotencyKey,
      metadata: { quantity, unitCost },
    });

    await tx.insert(usageEvents).values({
      tenantId,
      userId: userId ?? null,
      action,
      quantity,
      creditsCharged: Math.abs(amount),
      metadata: { referenceId },
    });
  });

  const balance = await getCreditBalance(tenantId);
  void checkLowBalanceAlerts(tenantId);
  return balance;
}

export async function grantCredits(params: {
  tenantId: string;
  amount: number;
  action: string;
  referenceId?: string;
}): Promise<number> {
  const { tenantId, amount, action, referenceId } = params;

  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(creditBalances)
      .where(eq(creditBalances.tenantId, tenantId))
      .limit(1);

    if (existing) {
      await tx
        .update(creditBalances)
        .set({ balance: sql`${creditBalances.balance} + ${amount}`, updatedAt: new Date() })
        .where(eq(creditBalances.tenantId, tenantId));
    } else {
      await tx.insert(creditBalances).values({ tenantId, balance: amount });
    }

    await tx.insert(creditTransactions).values({
      tenantId,
      amount,
      action,
      referenceId,
    });
  });

  return await getCreditBalance(tenantId);
}

export async function listUserCreditBalances(tenantId: string) {
  return db
    .select({
      userId: userCreditBalances.userId,
      remaining: userCreditBalances.remaining,
    })
    .from(userCreditBalances)
    .where(eq(userCreditBalances.tenantId, tenantId));
}

export async function setUserCreditAllocation(params: {
  tenantId: string;
  userId: string;
  remaining: number;
  actorUserId?: string;
}): Promise<UserCreditView> {
  const nextRemaining = Math.floor(params.remaining);
  if (!Number.isFinite(nextRemaining) || nextRemaining < 0) {
    throw new AllocationError("Allocation must be zero or more.", 0);
  }

  await db.transaction(async (tx) => {
    const [poolRow] = await tx
      .select({ balance: creditBalances.balance })
      .from(creditBalances)
      .where(eq(creditBalances.tenantId, params.tenantId))
      .limit(1);
    const pool = poolRow?.balance ?? 0;

    const [userRow] = await tx
      .select()
      .from(userCreditBalances)
      .where(
        and(
          eq(userCreditBalances.tenantId, params.tenantId),
          eq(userCreditBalances.userId, params.userId),
        ),
      )
      .limit(1);

    const [sumRow] = await tx
      .select({ total: sql<number>`coalesce(sum(${userCreditBalances.remaining}), 0)::int` })
      .from(userCreditBalances)
      .where(eq(userCreditBalances.tenantId, params.tenantId));

    const leftover = Math.max(0, pool - (sumRow?.total ?? 0));
    const currentRemaining = userRow?.remaining ?? 0;
    const fit = allocationDeltaFits({ leftover, currentRemaining, nextRemaining });
    if (!fit.ok) {
      throw new AllocationError(
        `Cannot allocate ${nextRemaining}. Only ${fit.leftover} leftover credits in the org pool.`,
        fit.leftover,
      );
    }

    const action = fit.delta >= 0 ? "credits.allocate" : "credits.reclaim";
    const now = new Date();

    if (userRow) {
      await tx
        .update(userCreditBalances)
        .set({ remaining: nextRemaining, updatedAt: now })
        .where(
          and(
            eq(userCreditBalances.tenantId, params.tenantId),
            eq(userCreditBalances.userId, params.userId),
          ),
        );
    } else {
      await tx.insert(userCreditBalances).values({
        tenantId: params.tenantId,
        userId: params.userId,
        remaining: nextRemaining,
        updatedAt: now,
      });
    }

    await tx.insert(creditTransactions).values({
      tenantId: params.tenantId,
      userId: params.userId,
      amount: 0,
      action,
      metadata: {
        from: currentRemaining,
        to: nextRemaining,
        delta: fit.delta,
        actorUserId: params.actorUserId,
      },
    });
  });

  return getUserCreditView({ tenantId: params.tenantId, userId: params.userId });
}

export async function allocateUserCredits(params: {
  tenantId: string;
  userId: string;
  amount: number;
  actorUserId?: string;
}): Promise<UserCreditView> {
  const row = await getUserRemainingRow(params.tenantId, params.userId);
  return setUserCreditAllocation({
    tenantId: params.tenantId,
    userId: params.userId,
    remaining: (row?.remaining ?? 0) + params.amount,
    actorUserId: params.actorUserId,
  });
}

export async function reclaimUserCredits(params: {
  tenantId: string;
  userId: string;
  amount: number;
  actorUserId?: string;
}): Promise<UserCreditView> {
  const row = await getUserRemainingRow(params.tenantId, params.userId);
  const next = Math.max(0, (row?.remaining ?? 0) - params.amount);
  return setUserCreditAllocation({
    tenantId: params.tenantId,
    userId: params.userId,
    remaining: next,
    actorUserId: params.actorUserId,
  });
}

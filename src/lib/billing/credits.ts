import { db, creditBalances, creditTransactions, usageEvents } from "@/db";
import { checkLowBalanceAlerts } from "@/lib/billing/analytics";
import { eq, sql } from "drizzle-orm";

export const CREDIT_COSTS: Record<string, number> = {
  "scout.company": 5,
  "scout.contact": 3,
  "enrich.paid": 15,
  "research.brief": 10,
  "writer.draft": 8,
  "writer.revision": 3,
  "email.live": 2,
  "linkedin.import": 50,
};

export class InsufficientCreditsError extends Error {
  required: number;
  available: number;

  constructor(required: number, available: number) {
    super(`Insufficient credits: need ${required}, have ${available}`);
    this.name = "InsufficientCreditsError";
    this.required = required;
    this.available = available;
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

export async function assertCredits(
  tenantId: string,
  action: string,
  quantity = 1,
): Promise<void> {
  const unitCost = CREDIT_COSTS[action];
  if (!unitCost) return;

  const required = unitCost * quantity;
  const available = await getCreditBalance(tenantId);
  if (available < required) {
    throw new InsufficientCreditsError(required, available);
  }
}

export async function deductCredits(params: {
  tenantId: string;
  action: string;
  quantity?: number;
  referenceId?: string;
  idempotencyKey?: string;
}): Promise<number> {
  const { tenantId, action, quantity = 1, referenceId, idempotencyKey } = params;
  const unitCost = CREDIT_COSTS[action];
  if (!unitCost) return await getCreditBalance(tenantId);

  const amount = -(unitCost * quantity);

  if (idempotencyKey) {
    const existing = await db.query.creditTransactions.findFirst({
      where: (t, { eq }) => eq(t.idempotencyKey, idempotencyKey),
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
    const required = Math.abs(amount);
    if (current < required) {
      throw new InsufficientCreditsError(required, current);
    }

    await tx
      .update(creditBalances)
      .set({ balance: sql`${creditBalances.balance} + ${amount}`, updatedAt: new Date() })
      .where(eq(creditBalances.tenantId, tenantId));

    await tx.insert(creditTransactions).values({
      tenantId,
      amount,
      action,
      referenceId,
      idempotencyKey,
      metadata: { quantity, unitCost },
    });

    await tx.insert(usageEvents).values({
      tenantId,
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

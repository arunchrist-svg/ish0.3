import { db, conversionEvents, creditBalances, users, orgMembers } from "@/db";
import { and, eq, gte } from "drizzle-orm";
import { getTenantPlan } from "@/lib/billing/entitlements";
import { sendSystemEmail } from "@/lib/email/system-email";

export async function trackConversion(params: {
  tenantId?: string;
  userId?: string;
  event: string;
  metadata?: Record<string, unknown>;
}) {
  await db.insert(conversionEvents).values({
    tenantId: params.tenantId,
    userId: params.userId,
    event: params.event,
    metadata: params.metadata ?? {},
  });
}

async function alertSentRecently(tenantId: string, event: string, hours = 24): Promise<boolean> {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  const [row] = await db
    .select({ id: conversionEvents.id })
    .from(conversionEvents)
    .where(and(eq(conversionEvents.tenantId, tenantId), eq(conversionEvents.event, event), gte(conversionEvents.createdAt, since)))
    .limit(1);
  return !!row;
}

export async function checkLowBalanceAlerts(tenantId: string): Promise<void> {
  const [balance] = await db
    .select()
    .from(creditBalances)
    .where(eq(creditBalances.tenantId, tenantId))
    .limit(1);
  if (!balance) return;

  const { plan } = await getTenantPlan(tenantId);
  const included = plan?.includedCredits ?? 200;
  if (included <= 0) return;

  const pct = (balance.balance / included) * 100;

  const owners = await db
    .select({ email: users.email })
    .from(orgMembers)
    .innerJoin(users, eq(users.id, orgMembers.userId))
    .where(eq(orgMembers.tenantId, tenantId));

  const recipients = owners.map((o) => o.email).filter(Boolean) as string[];
  if (!recipients.length) return;

  if (balance.balance <= 0) {
    if (await alertSentRecently(tenantId, "credits_depleted")) return;
    await sendSystemEmail({
      to: recipients,
      subject: "Credit balance depleted",
      html: "<p>Your workspace has run out of credits. Top up or upgrade to continue scouting and outreach.</p>",
    });
    await trackConversion({ tenantId, event: "credits_depleted" });
  } else if (pct <= 20) {
    if (await alertSentRecently(tenantId, "credits_low_80pct")) return;
    await sendSystemEmail({
      to: recipients,
      subject: "Credits running low (under 20%)",
      html: `<p>You have <strong>${balance.balance}</strong> credits remaining. Consider topping up before your next scout run.</p>`,
    });
    await trackConversion({ tenantId, event: "credits_low_80pct" });
  }
}

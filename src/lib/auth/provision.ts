import { db, tenants, workspaces, workspaceSettings, orgMembers, plans, subscriptions, creditBalances } from "@/db";
import { eq } from "drizzle-orm";

const TRIAL_CREDITS = 200;

export async function provisionNewTenant(params: {
  userId: string;
  orgName: string;
  workspaceName: string;
  planSlug?: string;
}): Promise<{ tenantId: string; workspaceId: string }> {
  const planSlug = params.planSlug ?? "starter";

  const [plan] = await db.select().from(plans).where(eq(plans.slug, planSlug)).limit(1);
  if (!plan) throw new Error(`Plan not found: ${planSlug}`);

  const [tenant] = await db
    .insert(tenants)
    .values({
      name: params.orgName,
      plan: planSlug,
      onboardingStatus: "in_progress",
      onboardingStep: 1,
      demoMode: true,
    })
    .returning();

  const [workspace] = await db
    .insert(workspaces)
    .values({ tenantId: tenant.id, name: params.workspaceName })
    .returning();

  await db.insert(workspaceSettings).values({
    workspaceId: workspace.id,
    enrichmentConfig: { dataMode: (plan.features as { enrichmentMode?: string })?.enrichmentMode ?? "free" },
    emailConfig: { sendMode: "dry_run" },
  });

  await db.insert(orgMembers).values({
    userId: params.userId,
    tenantId: tenant.id,
    role: "owner",
  });

  await db.insert(subscriptions).values({
    tenantId: tenant.id,
    planId: plan.id,
    status: "trialing",
    currentPeriodStart: new Date(),
    currentPeriodEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
  });

  await db.insert(creditBalances).values({
    tenantId: tenant.id,
    balance: TRIAL_CREDITS,
    periodStart: new Date(),
    periodEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
  });

  return { tenantId: tenant.id, workspaceId: workspace.id };
}

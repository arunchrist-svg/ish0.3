import { db, tenants, workspaces, workspaceSettings, orgMembers, plans, subscriptions, creditBalances } from "@/db";
import { eq } from "drizzle-orm";
import { slugifyTenantName, normalizeTenantSlug } from "@/lib/auth/slug";

const TRIAL_CREDITS = 200;

async function resolveUniqueSlug(baseName: string, explicitSlug?: string): Promise<string> {
  const base = normalizeTenantSlug(explicitSlug ?? slugifyTenantName(baseName));
  let candidate = base;
  let n = 0;
  while (true) {
    const [existing] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, candidate)).limit(1);
    if (!existing) return candidate;
    n += 1;
    candidate = `${base}-${n}`;
  }
}

export async function provisionTenantShell(params: {
  orgName: string;
  workspaceName: string;
  planSlug?: string;
  slug?: string;
}): Promise<{ tenantId: string; workspaceId: string; slug: string }> {
  const planSlug = params.planSlug ?? "starter";

  const [plan] = await db.select().from(plans).where(eq(plans.slug, planSlug)).limit(1);
  if (!plan) throw new Error(`Plan not found: ${planSlug}`);

  const slug = await resolveUniqueSlug(params.orgName, params.slug);

  const [tenant] = await db
    .insert(tenants)
    .values({
      name: params.orgName,
      slug,
      plan: planSlug,
      onboardingStatus: "pending",
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

  return { tenantId: tenant.id, workspaceId: workspace.id, slug };
}

export async function provisionNewTenant(params: {
  userId: string;
  orgName: string;
  workspaceName: string;
  planSlug?: string;
  slug?: string;
}): Promise<{ tenantId: string; workspaceId: string; slug: string }> {
  const { tenantId, workspaceId, slug } = await provisionTenantShell({
    orgName: params.orgName,
    workspaceName: params.workspaceName,
    planSlug: params.planSlug,
    slug: params.slug,
  });

  await db.insert(orgMembers).values({
    userId: params.userId,
    tenantId,
    role: "owner",
    status: "active",
  });

  await db
    .update(tenants)
    .set({ onboardingStatus: "in_progress", onboardingStep: 1 })
    .where(eq(tenants.id, tenantId));

  return { tenantId, workspaceId, slug };
}

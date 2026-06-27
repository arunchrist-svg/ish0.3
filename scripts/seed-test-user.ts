import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { eq } from "drizzle-orm";
import { hashPassword } from "../src/lib/auth/password";
import * as schema from "../src/db/schema";

const TEST_USER_ID = "00000000-0000-0000-0000-000000000100";
const TEST_TENANT_ID = "00000000-0000-0000-0000-000000000101";
const TEST_WORKSPACE_ID = "00000000-0000-0000-0000-000000000102";
const TEST_CAMPAIGN_ID = "00000000-0000-0000-0000-000000000103";
const TEST_ACCOUNT_ID = "00000000-0000-0000-0000-000000000110";
const TEST_CONTACT_ID = "00000000-0000-0000-0000-000000000111";
const TEST_LEAD_DRAFT_ID = "00000000-0000-0000-0000-000000000112";
const TEST_LEAD_REPLIED_ID = "00000000-0000-0000-0000-000000000113";
const TEST_CONTACT_REPLIED_ID = "00000000-0000-0000-0000-000000000114";

const TEST_EMAIL = "test@ish.local";
const TEST_PASSWORD = process.env.TEST_USER_PASSWORD ?? "Test-ISH-2026!";

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  const isLocal = /localhost|127\.0\.0\.1/.test(url);
  const allowRemote = process.env.ALLOW_TEST_SEED === "true";
  if (!isLocal && !allowRemote) {
    console.error(
      "Refusing to seed test user on non-local DATABASE_URL. Set ALLOW_TEST_SEED=true to override.",
    );
    process.exit(1);
  }

  const { db } = await import("../src/db");

  const [plan] = await db.select().from(schema.plans).where(eq(schema.plans.slug, "growth")).limit(1);
  if (!plan) {
    throw new Error("Growth plan not found. Run db:migrate and db:seed first.");
  }

  const passwordHash = await hashPassword(TEST_PASSWORD);

  await db
    .insert(schema.users)
    .values({
      id: TEST_USER_ID,
      email: TEST_EMAIL,
      passwordHash,
      name: "Test User",
      platformRole: "user",
    })
    .onConflictDoUpdate({
      target: schema.users.email,
      set: { passwordHash, name: "Test User" },
    });

  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, TEST_EMAIL)).limit(1);
  if (!user) throw new Error("Failed to create test user");

  await db
    .insert(schema.tenants)
    .values({
      id: TEST_TENANT_ID,
      name: "ISH Test Org",
      slug: "ish-test-org",
      plan: "growth",
      onboardingStatus: "complete",
      onboardingStep: 5,
      demoMode: true,
    })
    .onConflictDoUpdate({
      target: schema.tenants.id,
      set: {
        onboardingStatus: "complete",
        onboardingStep: 5,
        demoMode: true,
        plan: "growth",
        slug: "ish-test-org",
      },
    });

  await db
    .insert(schema.workspaces)
    .values({ id: TEST_WORKSPACE_ID, tenantId: TEST_TENANT_ID, name: "Test Workspace" })
    .onConflictDoNothing();

  await db
    .insert(schema.workspaceSettings)
    .values({
      workspaceId: TEST_WORKSPACE_ID,
      enrichmentConfig: { dataMode: "free" },
      emailConfig: { sendMode: "dry_run", provider: "smtp" },
    })
    .onConflictDoNothing();

  await db
    .insert(schema.orgMembers)
    .values({ userId: user.id, tenantId: TEST_TENANT_ID, role: "owner" })
    .onConflictDoUpdate({
      target: [schema.orgMembers.userId, schema.orgMembers.tenantId],
      set: { role: "owner" },
    });

  await db
    .insert(schema.subscriptions)
    .values({
      tenantId: TEST_TENANT_ID,
      planId: plan.id,
      status: "active",
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    })
    .onConflictDoNothing();

  await db
    .insert(schema.creditBalances)
    .values({
      tenantId: TEST_TENANT_ID,
      balance: 5000,
      periodStart: new Date(),
      periodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    })
    .onConflictDoUpdate({
      target: schema.creditBalances.tenantId,
      set: { balance: 5000 },
    });

  await db
    .insert(schema.campaigns)
    .values({
      id: TEST_CAMPAIGN_ID,
      tenantId: TEST_TENANT_ID,
      workspaceId: TEST_WORKSPACE_ID,
      name: "E2E Test Campaign",
      season: "diwali",
      startDate: new Date("2026-09-15"),
      endDate: new Date("2026-10-31"),
      giftingContext: "Automated test campaign",
      targetCities: ["Bangalore"],
      targetIndustries: ["IT"],
      cadenceDays: [4, 8, 14],
      isActive: true,
    })
    .onConflictDoNothing();

  await db
    .insert(schema.accounts)
    .values({
      id: TEST_ACCOUNT_ID,
      tenantId: TEST_TENANT_ID,
      workspaceId: TEST_WORKSPACE_ID,
      name: "Test Corp India",
      domain: "testcorp.in",
      website: "https://testcorp.in",
      industry: "IT",
      city: "Bangalore",
      employees: "500",
      giftScore: 75,
      dataSource: "test",
    })
    .onConflictDoNothing();

  await db
    .insert(schema.contacts)
    .values([
      {
        id: TEST_CONTACT_ID,
        tenantId: TEST_TENANT_ID,
        workspaceId: TEST_WORKSPACE_ID,
        accountId: TEST_ACCOUNT_ID,
        name: "Priya Sharma",
        firstName: "Priya",
        lastName: "Sharma",
        title: "HR Director",
        email: "priya.sharma@testcorp.in",
        emailStatus: "verified",
        isKeyDM: true,
        matchScore: 85,
        dataSource: "test",
      },
      {
        id: TEST_CONTACT_REPLIED_ID,
        tenantId: TEST_TENANT_ID,
        workspaceId: TEST_WORKSPACE_ID,
        accountId: TEST_ACCOUNT_ID,
        name: "Vikram Patel",
        firstName: "Vikram",
        lastName: "Patel",
        title: "Procurement Head",
        email: "vikram.p@testcorp.in",
        emailStatus: "verified",
        isKeyDM: true,
        matchScore: 78,
        dataSource: "test",
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(schema.leads)
    .values([
      {
        id: TEST_LEAD_DRAFT_ID,
        tenantId: TEST_TENANT_ID,
        workspaceId: TEST_WORKSPACE_ID,
        contactId: TEST_CONTACT_ID,
        accountId: TEST_ACCOUNT_ID,
        campaignId: TEST_CAMPAIGN_ID,
        status: "draft_ready",
        score: 85,
        scoreGrade: "A",
        leadSource: "test",
        rating: "Warm",
        owner: "Test User",
        tags: ["Test"],
      },
      {
        id: TEST_LEAD_REPLIED_ID,
        tenantId: TEST_TENANT_ID,
        workspaceId: TEST_WORKSPACE_ID,
        contactId: TEST_CONTACT_REPLIED_ID,
        accountId: TEST_ACCOUNT_ID,
        campaignId: TEST_CAMPAIGN_ID,
        status: "replied",
        score: 80,
        scoreGrade: "B",
        leadSource: "test",
        rating: "Warm",
        owner: "Test User",
        tags: ["Test"],
      },
    ])
    .onConflictDoUpdate({
      target: schema.leads.id,
      set: { updatedAt: new Date() },
    });

  for (const [leadId, stage] of [
    [TEST_LEAD_DRAFT_ID, "draft_ready"],
    [TEST_LEAD_REPLIED_ID, "replied"],
  ] as const) {
    const existing = await db.query.yieldFunnel.findFirst({
      where: eq(schema.yieldFunnel.leadId, leadId),
    });
    if (!existing) {
      await db.insert(schema.yieldFunnel).values({
        leadId,
        stage,
        metadata: { source: "test_seed" },
      });
    }
  }

  console.log("Test user seeded:", TEST_EMAIL);
  console.log("Draft-ready lead:", TEST_LEAD_DRAFT_ID);
  console.log("Replied lead:", TEST_LEAD_REPLIED_ID);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

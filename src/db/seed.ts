import { config } from "dotenv";
config({ path: ".env.local" });
config();
import * as schema from "./schema";

const TENANT_ID = "00000000-0000-0000-0000-000000000001";
const WORKSPACE_ID = "00000000-0000-0000-0000-000000000002";
const CAMPAIGN_ID = "00000000-0000-0000-0000-000000000003";
const SAMPLE_ACCOUNT_ID = "00000000-0000-0000-0000-000000000010";
const SAMPLE_CONTACT_ID = "00000000-0000-0000-0000-000000000011";
const SAMPLE_LEAD_ID = "00000000-0000-0000-0000-000000000012";

async function seed() {
  const { db } = await import("./index");
  console.log("Seeding Nebula demo tenant...");

  await db
    .insert(schema.tenants)
    .values({ id: TENANT_ID, name: "Demo Co", slug: "demo-co", plan: "starter" })
    .onConflictDoNothing();

  await db
    .insert(schema.workspaces)
    .values({ id: WORKSPACE_ID, tenantId: TENANT_ID, name: "Sales" })
    .onConflictDoNothing();

  await db
    .insert(schema.campaigns)
    .values({
      id: CAMPAIGN_ID,
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      name: "Outbound 2026",
      season: "evergreen",
      startDate: new Date("2026-01-01"),
      endDate: new Date("2026-12-31"),
      buyingContext: "General B2B outreach campaign. Configure brand and vertical pack in Settings.",
      targetCities: ["Bangalore", "Mumbai", "Delhi"],
      targetIndustries: ["IT", "Manufacturing", "BFSI"],
      cadenceDays: [4, 8, 14],
      isActive: true,
    })
    .onConflictDoNothing();

  await db
    .insert(schema.accounts)
    .values({
      id: SAMPLE_ACCOUNT_ID,
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      name: "Acme Industries",
      domain: "acme.example",
      website: "https://acme.example",
      industry: "Manufacturing",
      city: "Bangalore",
      employees: "1,200",
      fitScore: 72,
      budgetBand: "₹5–10L",
      intelNotes: "Sample account for local development.",
      dataSource: "sample",
    })
    .onConflictDoNothing();

  await db
    .insert(schema.contacts)
    .values({
      id: SAMPLE_CONTACT_ID,
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      accountId: SAMPLE_ACCOUNT_ID,
      name: "Priya Sharma",
      firstName: "Priya",
      lastName: "Sharma",
      title: "HR Director",
      department: "Human Resources",
      seniority: "Director",
      email: "priya.sharma@acme.example",
      emailStatus: "verified",
      isKeyDM: true,
      matchScore: 80,
      dataSource: "sample",
    })
    .onConflictDoNothing();

  await db
    .insert(schema.leads)
    .values({
      id: SAMPLE_LEAD_ID,
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      contactId: SAMPLE_CONTACT_ID,
      accountId: SAMPLE_ACCOUNT_ID,
      campaignId: CAMPAIGN_ID,
      status: "scouted",
      score: 72,
      scoreGrade: "B",
      owner: "Account Owner",
      researcherEligible: true,
    })
    .onConflictDoNothing();

  await db
    .insert(schema.workspaceSettings)
    .values({
      workspaceId: WORKSPACE_ID,
      enrichmentConfig: {},
      emailConfig: {
        brandConfig: {
          brandSlug: "custom",
          verticalPackId: "general",
          brandName: "Demo Co",
          vertical: "general",
          productSummary: "",
          buyerPersonas: ["HR Manager"],
        },
        campaignMode: "custom",
      },
    })
    .onConflictDoNothing();

  console.log("Seed complete. For India Sweet House sample data, run: npx tsx scripts/seed-packs/ish-demo.ts");
  process.exit(0);
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});

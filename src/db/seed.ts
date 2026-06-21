import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { eq } from "drizzle-orm";
import * as schema from "./schema";

const TENANT_ID = "00000000-0000-0000-0000-000000000001";
const WORKSPACE_ID = "00000000-0000-0000-0000-000000000002";
const CAMPAIGN_ID = "00000000-0000-0000-0000-000000000003";
const SAMPLE_ACCOUNT_ID = "00000000-0000-0000-0000-000000000010";
const SAMPLE_CONTACT_ID = "00000000-0000-0000-0000-000000000011";
const SAMPLE_LEAD_ID = "00000000-0000-0000-0000-000000000012";

async function seed() {
  const { db } = await import("./index");
  console.log("Seeding ISH tenant...");

  await db
    .insert(schema.tenants)
    .values({ id: TENANT_ID, name: "India Sweet House", plan: "starter" })
    .onConflictDoNothing();

  await db
    .insert(schema.workspaces)
    .values({ id: WORKSPACE_ID, tenantId: TENANT_ID, name: "ISH Gifting" })
    .onConflictDoNothing();

  await db.insert(schema.campaigns).values({
    id: CAMPAIGN_ID,
    tenantId: TENANT_ID,
    workspaceId: WORKSPACE_ID,
    name: "Diwali 2026",
    season: "diwali",
    startDate: new Date("2026-09-15"),
    endDate: new Date("2026-10-31"),
    giftingContext:
      "Diwali 2026 corporate gifting campaign. ISH offers premium pure-ghee mithai, dry fruit hampers, and gift boxes for corporates. Focus on bulk orders for 100–10,000 employees. Key hook: festival tradition, employee appreciation, premium local artisan quality.",
    targetCities: ["Bangalore", "Hosur", "Mysore", "Pune", "Chennai"],
    targetIndustries: ["IT", "Manufacturing", "Real Estate", "Pharma", "Retail", "BFSI"],
    cadenceDays: [4, 8, 14],
    isActive: true,
  }).onConflictDoNothing();

  await db.insert(schema.accounts).values({
    id: SAMPLE_ACCOUNT_ID,
    tenantId: TENANT_ID,
    workspaceId: WORKSPACE_ID,
    name: "Bosch India",
    domain: "bosch.in",
    website: "https://www.bosch.in",
    industry: "Manufacturing",
    city: "Hosur",
    employees: "8,500",
    giftScore: 88,
    giftBudget: "₹15–20L",
    intelNotes: "Posted about employee appreciation on LinkedIn. Strong Diwali gifting history.",
    dataSource: "sample",
  }).onConflictDoNothing();

  await db.insert(schema.contacts).values({
    id: SAMPLE_CONTACT_ID,
    tenantId: TENANT_ID,
    workspaceId: WORKSPACE_ID,
    accountId: SAMPLE_ACCOUNT_ID,
    name: "Rajan Nair",
    firstName: "Rajan",
    lastName: "Nair",
    title: "HR Director",
    department: "Human Resources",
    seniority: "Director",
    email: "rajan.nair@boschindia.com",
    emailStatus: "verified",
    phone: "+91 98450-12345",
    linkedIn: "https://www.linkedin.com/in/rajan-nair",
    bio: "Leads HR for Bosch India manufacturing operations in Hosur. Decision-maker for employee engagement and festival gifting.",
    isKeyDM: true,
    matchScore: 90,
    engagementSignals: ["LinkedIn post on employee appreciation", "Approved vendor contracts in past 2 quarters"],
    dataSource: "sample",
  }).onConflictDoNothing();

  await db.insert(schema.leads).values({
    id: SAMPLE_LEAD_ID,
    tenantId: TENANT_ID,
    workspaceId: WORKSPACE_ID,
    contactId: SAMPLE_CONTACT_ID,
    accountId: SAMPLE_ACCOUNT_ID,
    campaignId: CAMPAIGN_ID,
    status: "scouted",
    score: 90,
    scoreGrade: "A",
    scoreTrend: "Steady",
    estimatedValue: "₹18,00,000",
    leadSource: "scout",
    rating: "Warm",
    owner: "ISH Cluster Mgr",
    tags: ["Lead", "Gifting Signal"],
    researcherEligible: true,
  }).onConflictDoNothing();

  const existingFunnel = await db.query.yieldFunnel.findFirst({
    where: eq(schema.yieldFunnel.leadId, SAMPLE_LEAD_ID),
  });
  if (!existingFunnel) {
    await db.insert(schema.yieldFunnel).values({
      leadId: SAMPLE_LEAD_ID,
      stage: "scouted",
      metadata: { source: "sample_seed" },
    });
  }

  const existingResearch = await db.query.leadResearch.findFirst({
    where: eq(schema.leadResearch.leadId, SAMPLE_LEAD_ID),
  });
  if (!existingResearch) {
    await db.insert(schema.leadResearch).values({
      leadId: SAMPLE_LEAD_ID,
      confidenceTier: "high",
      confidenceScore: 85,
      giftingHook: "Diwali employee appreciation — 8,500 employees across Hosur plant",
      estimatedOrderValue: "₹18,00,000",
      scoreFactors: [
        { label: "Purchase timeframe is", bold: "next quarter" },
        { label: "Estimated budget is", bold: "₹18,00,000" },
        { label: "Lead is", bold: "relatively new" },
      ],
      rawBrief: "Sample lead for ISH Sales Accelerator demo.",
    });
  }

  console.log("Seed complete.");
  console.log("Sample lead:", SAMPLE_LEAD_ID, "— Rajan Nair @ Bosch India");
}

seed().catch(console.error);

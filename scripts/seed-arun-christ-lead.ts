import { config } from "dotenv";
config({ path: ".env.local" });

import { db, accounts, contacts, leads, yieldFunnel } from "../src/db";
import { eq } from "drizzle-orm";

const TENANT_ID = "91deac0f-9013-4b11-baa3-28421e9a287c";
const WORKSPACE_ID = "cb86c446-0839-4ab8-9f47-ae295bfa5e36";
const ACCOUNT_ID = "00000000-0000-0000-0000-000000000118";
const CONTACT_ID = "00000000-0000-0000-0000-000000000119";
const LEAD_ID = "00000000-0000-0000-0000-000000000120";

async function main() {
  await db.insert(accounts).values({
    id: ACCOUNT_ID,
    tenantId: TENANT_ID,
    workspaceId: WORKSPACE_ID,
    name: "Christ Test Co",
    domain: "christtest.local",
    website: "https://christtest.local",
    industry: "IT",
    city: "Bangalore",
    employees: "120",
    giftScore: 78,
    giftBudget: "₹1–2L",
    intelNotes: "Second test account for outreach email testing (Arun M).",
    dataSource: "sample",
  }).onConflictDoNothing();

  await db.insert(contacts).values({
    id: CONTACT_ID,
    tenantId: TENANT_ID,
    workspaceId: WORKSPACE_ID,
    accountId: ACCOUNT_ID,
    name: "Arun M",
    firstName: "Arun",
    lastName: "M",
    title: "HR Manager",
    department: "Human Resources",
    seniority: "Manager",
    email: "arunchrist@gmail.com",
    emailStatus: "verified",
    bio: "Test contact for email outreach (arunchrist@gmail.com).",
    isKeyDM: true,
    matchScore: 82,
    engagementSignals: ["Test lead for email verification"],
    dataSource: "sample",
  }).onConflictDoNothing();

  await db.insert(leads).values({
    id: LEAD_ID,
    tenantId: TENANT_ID,
    workspaceId: WORKSPACE_ID,
    contactId: CONTACT_ID,
    accountId: ACCOUNT_ID,
    status: "researched",
    score: 82,
    scoreGrade: "B",
    scoreTrend: "Steady",
    estimatedValue: "₹1,80,000",
    leadSource: "manual",
    rating: "Warm",
    owner: "ISH Cluster Mgr",
    tags: ["Lead", "Test"],
    researcherEligible: true,
    isPinned: true,
  }).onConflictDoUpdate({
    target: leads.id,
    set: {
      status: "researched",
      contactId: CONTACT_ID,
      accountId: ACCOUNT_ID,
      updatedAt: new Date(),
    },
  });

  const existingFunnel = await db.query.yieldFunnel.findFirst({
    where: eq(yieldFunnel.leadId, LEAD_ID),
  });
  if (!existingFunnel) {
    await db.insert(yieldFunnel).values({
      leadId: LEAD_ID,
      stage: "researched",
      metadata: { source: "test_seed", note: "Arun M arunchrist@gmail.com" },
    });
  }

  console.log("Lead created:");
  console.log("  ID:", LEAD_ID);
  console.log("  Name: Arun M");
  console.log("  Email: arunchrist@gmail.com");
  console.log("  Company: Christ Test Co");
  console.log("  Status: researched (Contact Ready)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * Point the local india-sweet-house workspace at ISH pack, Autopilot, and sender identity.
 * Run: npx tsx scripts/bootstrap-local-ish.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { eq } from "drizzle-orm";
import {
  db,
  tenants,
  workspaces,
  workspaceSettings,
  campaigns,
  creditBalances,
  orgMembers,
  users,
} from "../src/db";
import { applyVerticalPack } from "../src/vertical-packs";
import { resolveEmailConfig } from "../src/lib/email/config";
import { persistWorkspaceEmailConfig, persistUserEmailConfig } from "../src/lib/settings/email-settings";
import {
  getEnrichmentConfig,
  lockScoutToAgenticAi,
  resolveEnrichmentConfig,
} from "../src/lib/enrichment/config";
import { giftingSweetsPack } from "../src/vertical-packs/gifting-sweets/pack";

const SLUG = "india-sweet-house";

async function main() {
  const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, SLUG)).limit(1);
  if (!tenant) throw new Error(`No tenant ${SLUG}`);
  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.tenantId, tenant.id))
    .limit(1);
  if (!workspace) throw new Error("No ISH workspace");

  const brand = applyVerticalPack("gifting-sweets", { defaultOutreachCta: "prasanth_sequence" });
  const intel = giftingSweetsPack.brandIntelDefaults;

  const existing = await db.query.workspaceSettings.findFirst({
    where: eq(workspaceSettings.workspaceId, workspace.id),
  });
  const existingEnrichment = (existing?.enrichmentConfig ?? {}) as Record<string, unknown>;
  const mergedEnrichment = lockScoutToAgenticAi(
    resolveEnrichmentConfig(getEnrichmentConfig().dataMode, {
      ...existingEnrichment,
      dataMode: "auto",
      searchProvider: "agentic_ai",
      brandIntelProductCategory: intel.productCategory,
      brandIntelCompetitorBrands: intel.competitorBrands,
      agentFlags: {
        ...((existingEnrichment.agentFlags as object) ?? {}),
        autopilotEnabled: true,
        replyAutoDraft: true,
        searchExactMode: true,
      },
    }),
  );

  await db
    .insert(workspaceSettings)
    .values({
      workspaceId: workspace.id,
      enrichmentConfig: mergedEnrichment,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: workspaceSettings.workspaceId,
      set: { enrichmentConfig: mergedEnrichment, updatedAt: new Date() },
    });

  const email = resolveEmailConfig({
    provider: "smtp",
    sendMode: "dry_run",
    outreachPaused: false,
    smtpHost: "smtp.gmail.com",
    smtpPort: 587,
    smtpSecure: false,
    smtpUser: process.env.SMTP_USER ?? "",
    smtpPass: process.env.SMTP_PASS ?? "",
    fromAddress: process.env.EMAIL_FROM_ADDRESS || process.env.EMAIL_FROM || "",
    fromName: process.env.EMAIL_FROM_NAME || "Srilaksha",
    fromLocation: "Hosur",
    replyToAddress: process.env.EMAIL_REPLY_TO_ADDRESS || "",
    replyToName: process.env.EMAIL_REPLY_TO_NAME || "Srilaksha",
    testRecipient: process.env.EMAIL_TEST_RECIPIENT || "",
    followUpPolicy: "auto_send",
    campaignMode: "diwali_gifting",
    brandConfig: brand,
  });
  await persistWorkspaceEmailConfig(email, workspace.id);

  const members = await db
    .select({ userId: orgMembers.userId, email: users.email })
    .from(orgMembers)
    .innerJoin(users, eq(users.id, orgMembers.userId))
    .where(eq(orgMembers.tenantId, tenant.id));
  for (const row of members) {
    await persistUserEmailConfig(
      {
        smtpUser: email.smtpUser,
        smtpPass: email.smtpPass,
        fromAddress: email.fromAddress,
        fromName: email.fromName,
        fromLocation: email.fromLocation,
        replyToAddress: email.replyToAddress,
        replyToName: email.replyToName,
      },
      workspace.id,
      row.userId,
    );
  }

  const existingCampaign = await db.query.campaigns.findFirst({
    where: eq(campaigns.workspaceId, workspace.id),
  });
  if (!existingCampaign) {
    await db.insert(campaigns).values({
      tenantId: tenant.id,
      workspaceId: workspace.id,
      name: "Diwali 2026",
      season: "diwali",
      startDate: new Date("2026-09-15"),
      endDate: new Date("2026-10-31"),
      buyingContext: giftingSweetsPack.brandTemplate.productSummary,
      targetCities: ["Bangalore", "Hosur", "Mysore", "Pune", "Chennai"],
      targetIndustries: [
        "IT",
        "Manufacturing",
        "Textiles",
        "Electronics",
        "Automotive",
        "Real Estate",
        "Pharma",
        "Retail",
        "BFSI",
      ],
      cadenceDays: [4, 8, 14],
      isActive: true,
    });
  }

  await db
    .update(creditBalances)
    .set({ balance: 10000 })
    .where(eq(creditBalances.tenantId, tenant.id));

  console.log("ISH local workspace ready", {
    tenant: tenant.id,
    workspace: workspace.id,
    pack: brand.verticalPackId,
    sendMode: email.sendMode,
  });
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

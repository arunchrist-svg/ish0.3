/**
 * Set up one SaaS client white-label on the test workspace from a real website.
 * Usage: ALLOW_TEST_SEED=true npx tsx scripts/setup-saas-client-freshworks.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { eq } from "drizzle-orm";
import {
  analyzeSellerWebsite,
  mergeWebsiteInsightsIntoBrand,
} from "../src/lib/brand/analyze-seller-website";
import {
  campaignModeOptionsForBrand,
} from "../src/lib/email/brand-presets";
import {
  defaultCampaignModeForIntent,
  resolvePlatformIntent,
} from "../src/lib/brand/platform-intent";
import { resolveEmailConfig } from "../src/lib/email/config";

const CLIENT = {
  label: "Stripe",
  url: "https://stripe.com",
  intent: "b2b_saas" as const,
};

const TEST_WORKSPACE_ID = "00000000-0000-0000-0000-000000000102";

async function main() {
  const allowRemote = process.env.ALLOW_TEST_SEED === "true";
  const url = process.env.DATABASE_URL ?? "";
  const isLocal = /localhost|127\.0\.0\.1/.test(url);
  if (!isLocal && !allowRemote) {
    console.error("Set ALLOW_TEST_SEED=true to write to non-local DATABASE_URL.");
    process.exit(1);
  }

  console.error(`Analyzing ${CLIENT.label} (${CLIENT.url}) with intent=${CLIENT.intent}…`);
  const result = await analyzeSellerWebsite({
    websiteUrl: CLIENT.url,
    orgName: CLIENT.label,
    platformIntent: CLIENT.intent,
  });

  const { db, workspaceSettings } = await import("../src/db");
  const [row] = await db
    .select()
    .from(workspaceSettings)
    .where(eq(workspaceSettings.workspaceId, TEST_WORKSPACE_ID))
    .limit(1);

  const existing = resolveEmailConfig((row?.emailConfig as object) ?? {});
  const brandConfig = mergeWebsiteInsightsIntoBrand(existing.brandConfig, result, {
    forceCustomSlug: true,
    platformIntent: CLIENT.intent,
  });
  brandConfig.brandName = CLIENT.label;

  const campaignMode = defaultCampaignModeForIntent(
    resolvePlatformIntent(brandConfig.platformIntent, brandConfig.verticalPackId),
  );
  const merged = resolveEmailConfig({
    ...existing,
    brandConfig,
    campaignMode,
  });

  await db
    .insert(workspaceSettings)
    .values({
      workspaceId: TEST_WORKSPACE_ID,
      emailConfig: merged,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: workspaceSettings.workspaceId,
      set: { emailConfig: merged, updatedAt: new Date() },
    });

  const campaignOptions = campaignModeOptionsForBrand(brandConfig).map((o) => o.value);
  const insights = result.insights;

  console.log(
    JSON.stringify(
      {
        ok: true,
        client: CLIENT.label,
        websiteUrl: result.websiteUrl,
        platformIntent: brandConfig.platformIntent,
        verticalPackId: brandConfig.verticalPackId,
        campaignMode,
        campaignDropdownOptions: campaignOptions,
        diwaliHidden: !campaignOptions.includes("diwali_gifting"),
        brandName: brandConfig.brandName,
        productSummary: brandConfig.productSummary,
        toneNotes: brandConfig.toneNotes,
        scoutIndustries: insights.scoutIndustries,
        scoutDepartments: insights.scoutDepartments,
        scoutSeniority: insights.scoutSeniority,
        buyerPersonas: insights.buyerPersonas,
        workspaceId: TEST_WORKSPACE_ID,
        loginHint: "test@ish.local / Test-ISH-2026! → Settings → Email, Scout",
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

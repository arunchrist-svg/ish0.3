import { NextResponse } from "next/server";
import { db, tenants } from "@/db";
import { eq } from "drizzle-orm";
import { requireTenantContext } from "@/lib/tenant";
import { saveWorkspaceEnrichmentOverrides } from "@/lib/settings/workspace-settings";
import type { EnrichmentConfig } from "@/lib/enrichment/config";
import type { ScoutGeoSelection } from "@/lib/geo/india";
import { handleApiError } from "@/lib/api-errors";
import { requirePipelineWrite } from "@/lib/auth/permissions";
import {
  analyzeSellerWebsite,
  mergeWebsiteInsightsIntoBrand,
  normalizeWebsiteUrl,
} from "@/lib/brand/analyze-seller-website";
import {
  brandConfigFromPlatformIntent,
} from "@/lib/email/brand-presets";
import {
  defaultCampaignModeForIntent,
  resolvePlatformIntent,
  type PlatformIntent,
} from "@/lib/brand/platform-intent";
import {
  getResolvedEmailConfig,
  patchWorkspaceBrandConfig,
} from "@/lib/settings/email-settings";
import type { BrandConfig, CampaignMode } from "@/lib/email/config";

/** Map legacy 6-step onboarding (with email at step 3) to 5-step flow. */
export function normalizeOnboardingStep(step: number): number {
  if (step <= 2) return step;
  if (step === 3) return 3;
  if (step === 4) return 4;
  if (step === 5) return 5;
  return 5;
}

export async function GET() {
  try {
    const ctx = await requireTenantContext();
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, ctx.tenantId)).limit(1);
    const emailConfig = await getResolvedEmailConfig(ctx.workspaceId);
    const rawStep = tenant?.onboardingStep ?? 1;
    return NextResponse.json({
      step: tenant?.onboardingStatus === "complete" ? 5 : normalizeOnboardingStep(rawStep),
      status: tenant?.onboardingStatus ?? "pending",
      orgName: tenant?.name,
      websiteUrl: emailConfig.brandConfig?.websiteUrl ?? "",
      brandReady: Boolean(emailConfig.brandConfig?.productSummary?.trim()),
    });
  } catch (e) {
    return handleApiError(e, "[onboarding/GET]");
  }
}

type OnboardingBody =
  | { step: 1; orgName: string; workspaceName?: string }
  | { step: 2; planSlug: string }
  | {
      step: 3;
      enrichmentConfig: Partial<EnrichmentConfig>;
      websiteUrl?: string;
      skipWebsiteAnalyze?: boolean;
      platformIntent?: PlatformIntent;
    }
  | { step: 4; skip?: boolean }
  | { step: 5; complete?: boolean }
  | { step: "location"; scoutGeo: ScoutGeoSelection };

async function persistBrandConfig(
  brandConfig: BrandConfig,
  workspaceId: string,
  extras?: { campaignMode?: CampaignMode },
) {
  await patchWorkspaceBrandConfig(brandConfig, workspaceId, extras);
}

export async function POST(req: Request) {
  try {
    const ctx = await requireTenantContext();
    requirePipelineWrite(ctx);
    const body = (await req.json()) as OnboardingBody;

    if (body.step === 1) {
      if (!body.orgName?.trim()) {
        return NextResponse.json({ error: "Organization name required" }, { status: 400 });
      }
      const orgName = body.orgName.trim();
      await db
        .update(tenants)
        .set({ name: orgName, onboardingStep: 2 })
        .where(eq(tenants.id, ctx.tenantId));

      // Seed brandName from org so Writer does not say "Your Company"
      try {
        const existing = await getResolvedEmailConfig(ctx.workspaceId);
        if (existing.brandConfig.brandSlug === "custom") {
          await persistBrandConfig(
            { ...existing.brandConfig, brandName: orgName },
            ctx.workspaceId,
          );
        }
      } catch (e) {
        console.warn("[onboarding] brand name seed failed:", e);
      }

      return NextResponse.json({ ok: true, nextStep: 2 });
    }

    if (body.step === 2) {
      const planSlug = body.planSlug || "starter";
      await db
        .update(tenants)
        .set({ plan: planSlug, onboardingStep: 3 })
        .where(eq(tenants.id, ctx.tenantId));
      return NextResponse.json({ ok: true, nextStep: 3 });
    }

    if (body.step === 3) {
      await saveWorkspaceEnrichmentOverrides(body.enrichmentConfig);

      const rawWebsite = body.websiteUrl?.trim() ?? "";
      let websiteWarning: string | undefined;
      let brandAnalyzed = false;
      const platformIntent = resolvePlatformIntent(body.platformIntent);

      if (rawWebsite && !body.skipWebsiteAnalyze) {
        const websiteUrl = normalizeWebsiteUrl(rawWebsite);
        if (!websiteUrl) {
          return NextResponse.json(
            { error: "Enter a valid website URL (e.g. https://acme.com)" },
            { status: 400 },
          );
        }

        const [tenant] = await db.select().from(tenants).where(eq(tenants.id, ctx.tenantId)).limit(1);
        const existing = await getResolvedEmailConfig(ctx.workspaceId);

        try {
          const result = await analyzeSellerWebsite({
            websiteUrl,
            orgName: tenant?.name,
            tenantId: ctx.tenantId,
            workspaceId: ctx.workspaceId,
            platformIntent,
          });
          const brandConfig = mergeWebsiteInsightsIntoBrand(existing.brandConfig, result, {
            forceCustomSlug: true,
            platformIntent,
          });
          if (tenant?.name?.trim() && brandConfig.brandName === "Your Company") {
            brandConfig.brandName = tenant.name.trim();
          }
          await persistBrandConfig(brandConfig, ctx.workspaceId, {
            campaignMode: defaultCampaignModeForIntent(platformIntent),
          });
          brandAnalyzed = true;
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Website analysis failed";
          try {
            const seeded = brandConfigFromPlatformIntent(platformIntent, {
              ...existing.brandConfig,
              brandSlug: "custom",
              brandName: tenant?.name?.trim() || existing.brandConfig.brandName,
              websiteUrl,
              platformIntent,
            });
            await persistBrandConfig(seeded, ctx.workspaceId, {
              campaignMode: defaultCampaignModeForIntent(platformIntent),
            });
          } catch (persistErr) {
            console.warn("[onboarding] website URL persist failed:", persistErr);
          }
          websiteWarning = msg;
        }
      } else {
        // Intent only (no website): still seed pack + campaign mode for email dropdowns
        try {
          const existing = await getResolvedEmailConfig(ctx.workspaceId);
          const [tenant] = await db.select().from(tenants).where(eq(tenants.id, ctx.tenantId)).limit(1);
          const seeded = brandConfigFromPlatformIntent(platformIntent, {
            ...existing.brandConfig,
            brandName: tenant?.name?.trim() || existing.brandConfig.brandName,
            websiteUrl: existing.brandConfig.websiteUrl,
            websiteInsights: existing.brandConfig.websiteInsights,
          });
          await persistBrandConfig(seeded, ctx.workspaceId, {
            campaignMode: defaultCampaignModeForIntent(platformIntent),
          });
        } catch (e) {
          console.warn("[onboarding] intent seed failed:", e);
        }
      }

      return NextResponse.json({
        ok: true,
        nextStep: 3,
        needsLocation: true,
        brandAnalyzed,
        websiteWarning,
        platformIntent,
      });
    }

    if (body.step === "location") {
      await saveWorkspaceEnrichmentOverrides({ scoutGeo: body.scoutGeo });
      await db.update(tenants).set({ onboardingStep: 4 }).where(eq(tenants.id, ctx.tenantId));
      return NextResponse.json({ ok: true, nextStep: 4 });
    }

    if (body.step === 4) {
      await db.update(tenants).set({ onboardingStep: 5 }).where(eq(tenants.id, ctx.tenantId));
      return NextResponse.json({ ok: true, nextStep: 5 });
    }

    if (body.step === 5) {
      await db
        .update(tenants)
        .set({ onboardingStatus: "complete", onboardingStep: 5 })
        .where(eq(tenants.id, ctx.tenantId));
      return NextResponse.json({ ok: true, redirect: "/" });
    }

    return NextResponse.json({ error: "Invalid step" }, { status: 400 });
  } catch (e) {
    return handleApiError(e, "[onboarding/POST]");
  }
}

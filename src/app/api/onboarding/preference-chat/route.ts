import { NextResponse } from "next/server";
import { db, tenants } from "@/db";
import { eq } from "drizzle-orm";
import { requireTenantContext } from "@/lib/tenant";
import { requirePipelineWrite } from "@/lib/auth/permissions";
import { handleApiError } from "@/lib/api-errors";
import { getResolvedEmailConfig } from "@/lib/settings/email-settings";
import { loadEnrichmentOverridesForWorkspace } from "@/lib/settings/workspace-settings";
import {
  isPreferenceReady,
  loadUserPreferenceProfile,
  saveUserPreferenceProfile,
} from "@/lib/settings/preference-profile";
import { runPreferenceCoachTurn } from "@/lib/agents/preference-chat";
import { sanitizeScoutGeo, scoutGeoHasSelection } from "@/lib/geo/india";

export async function POST(req: Request) {
  try {
    const ctx = await requireTenantContext();
    requirePipelineWrite(ctx);
    const body = (await req.json().catch(() => ({}))) as { message?: string; chip?: string; finish?: boolean };

    const [emailConfig, enrichment, existingProfile] = await Promise.all([
      getResolvedEmailConfig(ctx.workspaceId),
      loadEnrichmentOverridesForWorkspace(ctx.workspaceId),
      loadUserPreferenceProfile(ctx.workspaceId),
    ]);

    const result = await runPreferenceCoachTurn({
      profile: existingProfile,
      brand: emailConfig.brandConfig,
      enrichment,
      message: typeof body.message === "string" ? body.message : undefined,
      chip: typeof body.chip === "string" ? body.chip : undefined,
      finish: Boolean(body.finish),
      tenantId: ctx.tenantId,
      workspaceId: ctx.workspaceId,
    });

    const saved = await saveUserPreferenceProfile(result.profile, ctx.workspaceId);

    if (body.finish && result.applied) {
      if (!result.needsLocation) {
        await db.update(tenants).set({ onboardingStep: 4 }).where(eq(tenants.id, ctx.tenantId));
      }
    } else if (body.finish && !result.readyToFinish) {
      return NextResponse.json(
        {
          error: "Confirm who to scout, the first-email ask, and how you close before applying.",
          ok: false,
          profile: saved,
          beat: result.beat,
          summary: saved.summary,
          topicsCovered: saved.topicsCovered,
          readyToFinish: false,
          preferenceReady: false,
          needsLocation: result.needsLocation,
          scoutGeo: sanitizeScoutGeo(enrichment.scoutGeo ?? saved.scout?.geo),
        },
        { status: 400 },
      );
    }

    const geo = sanitizeScoutGeo(saved.scout?.geo ?? enrichment.scoutGeo);
    return NextResponse.json({
      ok: true,
      profile: saved,
      beat: result.beat,
      summary: saved.summary,
      topicsCovered: saved.topicsCovered,
      readyToFinish: result.readyToFinish,
      preferenceReady: isPreferenceReady(saved.topicsCovered),
      needsLocation: result.needsLocation,
      nextStep: result.nextStep,
      scoutGeo: scoutGeoHasSelection(geo) ? geo : sanitizeScoutGeo(enrichment.scoutGeo),
      applied: result.applied,
    });
  } catch (e) {
    return handleApiError(e, "[onboarding/preference-chat]");
  }
}

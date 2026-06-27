import { NextResponse } from "next/server";
import { db, tenants } from "@/db";
import { eq } from "drizzle-orm";
import { requireTenantContext } from "@/lib/tenant";
import { saveWorkspaceEnrichmentOverrides } from "@/lib/settings/workspace-settings";
import type { EnrichmentConfig } from "@/lib/enrichment/config";
import { handleApiError } from "@/lib/api-errors";
import { requirePipelineWrite } from "@/lib/auth/permissions";

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
    const rawStep = tenant?.onboardingStep ?? 1;
    return NextResponse.json({
      step: tenant?.onboardingStatus === "complete" ? 5 : normalizeOnboardingStep(rawStep),
      status: tenant?.onboardingStatus ?? "pending",
      orgName: tenant?.name,
    });
  } catch (e) {
    return handleApiError(e, "[onboarding/GET]");
  }
}

type OnboardingBody =
  | { step: 1; orgName: string; workspaceName?: string }
  | { step: 2; planSlug: string }
  | { step: 3; enrichmentConfig: Partial<EnrichmentConfig> }
  | { step: 4; skip?: boolean }
  | { step: 5; complete?: boolean };

export async function POST(req: Request) {
  try {
    const ctx = await requireTenantContext();
    requirePipelineWrite(ctx);
    const body = (await req.json()) as OnboardingBody;

    if (body.step === 1) {
      if (!body.orgName?.trim()) {
        return NextResponse.json({ error: "Organization name required" }, { status: 400 });
      }
      await db
        .update(tenants)
        .set({ name: body.orgName.trim(), onboardingStep: 2 })
        .where(eq(tenants.id, ctx.tenantId));
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

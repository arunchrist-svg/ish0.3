import { NextResponse } from "next/server";
import { db, tenants, workspaceSettings, users } from "@/db";
import { eq } from "drizzle-orm";
import { requireTenantContext, UnauthorizedError } from "@/lib/tenant";
import { saveWorkspaceEmailOverrides, verifyEmailConnection } from "@/lib/settings/email-settings";
import { saveWorkspaceEnrichmentOverrides } from "@/lib/settings/workspace-settings";
import type { EmailConfig } from "@/lib/email/config";
import type { EnrichmentConfig } from "@/lib/enrichment/config";
import { sendEmail } from "@/lib/email/email-sender";
import { handleApiError } from "@/lib/api-errors";

export async function GET() {
  try {
    const ctx = await requireTenantContext();
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, ctx.tenantId)).limit(1);
    return NextResponse.json({
      step: tenant?.onboardingStep ?? 1,
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
  | { step: 3; emailConfig: Partial<EmailConfig>; sendTest?: boolean }
  | { step: 4; enrichmentConfig: Partial<EnrichmentConfig> }
  | { step: 5; skip?: boolean }
  | { step: 6; complete?: boolean };

export async function POST(req: Request) {
  try {
    const ctx = await requireTenantContext();
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
      const config = await saveWorkspaceEmailOverrides({
        ...body.emailConfig,
        sendMode: body.emailConfig.sendMode ?? "test",
      });

      if (body.sendTest) {
        if (config.provider === "smtp") {
          const verified = await verifyEmailConnection(body.emailConfig);
          if (!verified.smtpConfigured) {
            return NextResponse.json({ error: "SMTP connection failed", hint: verified.smtpHint }, { status: 400 });
          }
        }

        const [user] = await db.select().from(users).where(eq(users.id, ctx.userId)).limit(1);
        const testTo = config.testRecipient || user?.email;
        if (!testTo) {
          return NextResponse.json({ error: "Test recipient required" }, { status: 400 });
        }

        await sendEmail({
          to: testTo,
          subject: "Verify your outreach email setup",
          html: "<p>Your email configuration is working. You can now send test outreach from the platform.</p>",
        });

        const [existing] = await db
          .select()
          .from(workspaceSettings)
          .where(eq(workspaceSettings.workspaceId, ctx.workspaceId))
          .limit(1);

        const emailConfig = {
          ...(existing?.emailConfig as object),
          ...body.emailConfig,
          verifiedAt: new Date().toISOString(),
        };

        await db
          .update(workspaceSettings)
          .set({ emailConfig, updatedAt: new Date() })
          .where(eq(workspaceSettings.workspaceId, ctx.workspaceId));
      }

      await db.update(tenants).set({ onboardingStep: 4 }).where(eq(tenants.id, ctx.tenantId));
      return NextResponse.json({ ok: true, nextStep: 4, config });
    }

    if (body.step === 4) {
      await saveWorkspaceEnrichmentOverrides(body.enrichmentConfig);
      await db.update(tenants).set({ onboardingStep: 5 }).where(eq(tenants.id, ctx.tenantId));
      return NextResponse.json({ ok: true, nextStep: 5 });
    }

    if (body.step === 5) {
      await db.update(tenants).set({ onboardingStep: 6 }).where(eq(tenants.id, ctx.tenantId));
      return NextResponse.json({ ok: true, nextStep: 6 });
    }

    if (body.step === 6) {
      await db
        .update(tenants)
        .set({ onboardingStatus: "complete", onboardingStep: 6 })
        .where(eq(tenants.id, ctx.tenantId));
      return NextResponse.json({ ok: true, redirect: "/" });
    }

    return NextResponse.json({ error: "Invalid step" }, { status: 400 });
  } catch (e) {
    return handleApiError(e, "[onboarding/POST]");
  }
}

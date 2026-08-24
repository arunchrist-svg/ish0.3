import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireTenantContext, UnauthorizedError, tenantContextToSealClaims } from "@/lib/tenant";
import { getCreditBalance } from "@/lib/billing/credits";
import { getResolvedEmailConfig } from "@/lib/settings/email-settings";
import { getWhatsAppConnection } from "@/lib/settings/whatsapp-settings";
import { getSmtpStatus, getResendStatus } from "@/lib/email/config";
import { getPermissionFlags } from "@/lib/auth/permissions";
import { db, tenants, users } from "@/db";
import { eq } from "drizzle-orm";
import {
  defaultIcpSummary,
  resolvePlatformIntent,
} from "@/lib/brand/platform-intent";
import { isSweetsGiftingSlug, isSweetsOnlyOperator } from "@/lib/brand/vertical-catalog";
import { resolveDefaultOutreachCta } from "@/lib/settings/preference-profile";
import {
  SEALED_SESSION_COOKIE,
  sealTenantClaims,
  sealedSessionCookieOptions,
  unsealTenantClaims,
} from "@/lib/auth/sealed-session";
import { mark, startTiming, withServerTiming } from "@/lib/perf/server-timing";

export const preferredRegion = ["sin1"];

export async function GET(req: Request) {
  const { marks, t0 } = startTiming();
  try {
    const authStart = performance.now();
    const ctx = await requireTenantContext();
    mark(marks, "auth", authStart);

    const { searchParams } = new URL(req.url);
    const includeWhatsapp = searchParams.get("whatsapp") !== "0";

    const dbStart = performance.now();
    const [user, tenant, credits, emailConfig, whatsapp] = await Promise.all([
      db
        .select({ id: users.id, email: users.email, name: users.name })
        .from(users)
        .where(eq(users.id, ctx.userId))
        .limit(1)
        .then((rows) => rows[0]),
      db.select().from(tenants).where(eq(tenants.id, ctx.tenantId)).limit(1).then((rows) => rows[0]),
      getCreditBalance(ctx.tenantId),
      getResolvedEmailConfig(ctx.workspaceId),
      includeWhatsapp ? getWhatsAppConnection(ctx.workspaceId) : Promise.resolve({ connected: false }),
    ]);
    mark(marks, "db", dbStart);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const permissions = getPermissionFlags(ctx);

    const insights = emailConfig.brandConfig?.websiteInsights;
    const sweetsGifting =
      isSweetsOnlyOperator(user.email) ||
      isSweetsGiftingSlug(tenant?.slug) ||
      isSweetsGiftingSlug(ctx.tenantSlug) ||
      isSweetsGiftingSlug(emailConfig.brandConfig?.brandSlug) ||
      isSweetsGiftingSlug(emailConfig.brandConfig?.verticalPackId);
    const platformIntent = sweetsGifting
      ? "corporate_gifting"
      : resolvePlatformIntent(
          emailConfig.brandConfig?.platformIntent ?? insights?.platformIntent,
          emailConfig.brandConfig?.verticalPackId ?? emailConfig.brandConfig?.brandSlug,
        );
    const roles = {
      scoutDepartments: insights?.scoutDepartments ?? [],
      scoutSeniority: insights?.scoutSeniority ?? [],
    };
    const scoutBrandDefaults = {
      industries: insights?.scoutIndustries ?? [],
      departments: roles.scoutDepartments,
      seniority: roles.scoutSeniority,
      brandName: emailConfig.brandConfig.brandName,
      analyzedAt: insights?.analyzedAt,
      icpSummary: insights?.icpSummary?.trim() || defaultIcpSummary(platformIntent),
      platformIntent,
      defaultOutreachCta: resolveDefaultOutreachCta(emailConfig.brandConfig),
    };

    const smtpStatus = getSmtpStatus(emailConfig);
    const resendStatus = getResendStatus(emailConfig);
    const emailConfigured =
      emailConfig.provider === "smtp" ? smtpStatus.configured : resendStatus.configured;

    const res = NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name },
      tenant: {
        id: ctx.tenantId,
        name: tenant?.name,
        slug: ctx.tenantSlug,
        plan: tenant?.plan,
        demoMode: ctx.demoMode,
        onboardingStatus: ctx.onboardingStatus,
        onboardingStep: ctx.onboardingStep,
      },
      workspaceId: ctx.workspaceId,
      role: ctx.role,
      platformRole: ctx.platformRole,
      isSuperadmin: ctx.isSuperadmin,
      mustChangePassword: ctx.mustChangePassword,
      permissions,
      sendMode: emailConfig.sendMode,
      emailConfigured,
      whatsappConnected: whatsapp.connected,
      credits,
      verticalPackId:
        emailConfig.brandConfig?.verticalPackId ??
        emailConfig.brandConfig?.brandSlug ??
        "general",
      scoutBrandDefaults,
    });

    const cookieStore = await cookies();
    if (!unsealTenantClaims(cookieStore.get(SEALED_SESSION_COOKIE)?.value)) {
      const sealed = sealTenantClaims(tenantContextToSealClaims(ctx));
      res.cookies.set(SEALED_SESSION_COOKIE, sealed, sealedSessionCookieOptions(sealed));
    }

    return withServerTiming(res, marks, t0);
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[auth/me]", e);
    return NextResponse.json({ error: "Failed to load session" }, { status: 500 });
  }
}

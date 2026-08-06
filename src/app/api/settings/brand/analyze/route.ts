import { NextResponse } from "next/server";
import { requireTenantContext, ForbiddenError } from "@/lib/tenant";
import { canManageSettings } from "@/lib/auth/permissions";
import { handleApiError } from "@/lib/api-errors";
import {
  analyzeSellerWebsite,
  mergeWebsiteInsightsIntoBrand,
  normalizeWebsiteUrl,
} from "@/lib/brand/analyze-seller-website";
import {
  getEmailConfigForApi,
  getResolvedEmailConfig,
  patchWorkspaceBrandConfig,
} from "@/lib/settings/email-settings";
import { db, tenants } from "@/db";
import { eq } from "drizzle-orm";

/**
 * Analyze the seller website and persist brand insights for Writer + Scout.
 * POST { websiteUrl: string, persist?: boolean, forceCustomSlug?: boolean }
 */
export async function POST(req: Request) {
  try {
    const ctx = await requireTenantContext();
    if (!canManageSettings(ctx.role, ctx.platformRole)) {
      throw new ForbiddenError("Admin access required");
    }

    const body = (await req.json().catch(() => ({}))) as {
      websiteUrl?: string;
      persist?: boolean;
      forceCustomSlug?: boolean;
    };

    const websiteUrl = normalizeWebsiteUrl(body.websiteUrl ?? "");
    if (!websiteUrl) {
      return NextResponse.json(
        { error: "Enter a valid website URL (e.g. https://acme.com)" },
        { status: 400 },
      );
    }

    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, ctx.tenantId)).limit(1);
    const existing = await getResolvedEmailConfig(ctx.workspaceId);

    const result = await analyzeSellerWebsite({
      websiteUrl,
      orgName: tenant?.name,
      tenantId: ctx.tenantId,
      workspaceId: ctx.workspaceId,
    });

    const brandConfig = mergeWebsiteInsightsIntoBrand(existing.brandConfig, result, {
      forceCustomSlug: body.forceCustomSlug ?? existing.brandConfig.brandSlug === "custom",
    });

    const persist = body.persist !== false;
    if (persist) {
      await patchWorkspaceBrandConfig(brandConfig, ctx.workspaceId);
      const config = await getEmailConfigForApi();
      return NextResponse.json({
        ok: true,
        websiteUrl: result.websiteUrl,
        insights: result.insights,
        brandConfig: config.brandConfig,
        config,
      });
    }

    return NextResponse.json({
      ok: true,
      websiteUrl: result.websiteUrl,
      insights: result.insights,
      brandConfig,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Website analysis failed";
    if (
      msg.includes("valid website") ||
      msg.includes("Could not read") ||
      msg.includes("could not determine") ||
      msg.includes("structured data")
    ) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    return handleApiError(e, "[api/settings/brand/analyze]");
  }
}

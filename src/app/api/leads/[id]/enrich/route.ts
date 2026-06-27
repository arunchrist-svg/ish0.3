import { NextResponse } from "next/server";
import { db, leads } from "@/db";
import { eq } from "drizzle-orm";
import { enrichLeadById } from "@/lib/enrichment/enrich-lead";
import { hasAnyPaidProvider } from "@/lib/enrichment/provider-config";
import { requireTenantContext, ForbiddenError } from "@/lib/tenant";
import { assertCredits, deductCredits } from "@/lib/billing/credits";
import { assertPlanEntitlement } from "@/lib/billing/entitlements";
import { checkLowBalanceAlerts } from "@/lib/billing/analytics";
import { handleApiError } from "@/lib/api-errors";
import type { DataMode } from "@/lib/enrichment/types";
import { requirePipelineWrite } from "@/lib/auth/permissions";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireTenantContext();
    requirePipelineWrite(ctx);
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const mode = (body.mode === "paid" ? "paid" : "free") as "free" | "paid";
    const refetch = body.refetch === true;
    const dataMode = (body.dataMode ?? process.env.DEFAULT_DATA_MODE ?? "free") as DataMode;

    const [lead] = await db.select().from(leads).where(eq(leads.id, id)).limit(1);
    if (!lead || lead.tenantId !== ctx.tenantId) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    if (mode === "paid") {
      await assertPlanEntitlement(ctx.tenantId, "paid_enrichment");
      if (!hasAnyPaidProvider()) {
        return NextResponse.json({ error: "Paid enrichment not available" }, { status: 400 });
      }
      await assertCredits(ctx.tenantId, "enrich.paid", 1);
    }

    const result = await enrichLeadById({ leadId: id, mode, dataMode, refetch });

    if (mode === "paid" && result.success) {
      await deductCredits({ tenantId: ctx.tenantId, action: "enrich.paid", referenceId: id });
      void checkLowBalanceAlerts(ctx.tenantId);
    }

    return NextResponse.json({
      success: result.success,
      enrichment: {
        email: result.email ?? null,
        phone: result.phone ?? null,
        emailStatus: result.emailStatus,
        emailConfidence: result.emailConfidence,
        confidenceTier: result.confidenceTier,
        enrichmentSource: result.enrichmentSource,
        enrichmentProvider: result.enrichmentProvider,
        title: result.title ?? null,
        message: result.message,
        alternateEmails: result.alternateEmails ?? [],
      },
    });
  } catch (e) {
    return handleApiError(e, "[leads/enrich]");
  }
}

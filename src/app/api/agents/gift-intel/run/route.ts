import { NextResponse } from "next/server";
import { runGiftIntelSweep } from "@/lib/agents/gift-intel";
import { requireTenantContext } from "@/lib/tenant";
import { handleApiError } from "@/lib/api-errors";
import { requirePipelineWrite } from "@/lib/auth/permissions";
import { getResolvedEnrichmentConfigForWorkspace } from "@/lib/settings/workspace-settings";
import { assertCompetitorsInList, resolveGiftIntelConfig } from "@/lib/gift-intel/config";
import type { SourceTier } from "@/lib/gift-intel/types";

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((v) => String(v).trim()).filter(Boolean))];
}

export async function POST(req: Request) {
  try {
    const ctx = await requireTenantContext();
    requirePipelineWrite(ctx);
    const body = await req.json().catch(() => ({}));
    const {
      competitorBrands,
      competitorBrand,
      cities,
      city,
      enabledSourceTiers,
    } = body as {
      competitorBrands?: string[];
      competitorBrand?: string;
      cities?: string[];
      city?: string;
      enabledSourceTiers?: SourceTier[];
    };

    const enrichment = await getResolvedEnrichmentConfigForWorkspace(ctx.workspaceId);
    const giftIntel = resolveGiftIntelConfig(enrichment);

    const brands = normalizeStringArray(competitorBrands);
    if (!brands.length && competitorBrand?.trim()) {
      brands.push(competitorBrand.trim());
    }

    if (!brands.length) {
      return NextResponse.json(
        { error: "Select at least one competitor brand. Configure competitors in Settings → Enrichment." },
        { status: 400 },
      );
    }

    assertCompetitorsInList(brands, giftIntel.competitorBrands);

    const selectedCities = normalizeStringArray(cities);
    if (!selectedCities.length && city?.trim()) {
      selectedCities.push(city.trim());
    }

    const result = await runGiftIntelSweep({
      tenantId: ctx.tenantId,
      workspaceId: ctx.workspaceId,
      targetBrands: brands,
      targetCategory: giftIntel.productCategory,
      enabledSourceTiers,
      targetCities: selectedCities.length ? selectedCities : undefined,
    });

    return NextResponse.json(result);
  } catch (e) {
    return handleApiError(e, "[api/agents/gift-intel/run]");
  }
}

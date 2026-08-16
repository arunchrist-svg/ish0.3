import { NextResponse } from "next/server";
import { runGiftIntelSweep } from "@/lib/agents/brand-intel";
import { runOccasionIntelSweep } from "@/lib/agents/occasion-intel";
import { requireTenantContext } from "@/lib/tenant";
import { handleApiError } from "@/lib/api-errors";
import { requirePipelineWrite } from "@/lib/auth/permissions";
import { getResolvedEnrichmentConfigForWorkspace } from "@/lib/settings/workspace-settings";
import { assertCompetitorsInList, resolveGiftIntelConfig } from "@/lib/brand-intel/config";
import { citiesForGiftIntelSweep } from "@/lib/geo/india";
import type { SourceTier } from "@/lib/brand-intel/types";

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
      sweepMode,
    } = body as {
      competitorBrands?: string[];
      competitorBrand?: string;
      cities?: string[];
      city?: string;
      enabledSourceTiers?: SourceTier[];
      sweepMode?: "competitors" | "occasions" | "upcoming_openings";
    };

    const rawCities = normalizeStringArray(cities);
    if (!rawCities.length && city?.trim()) {
      rawCities.push(city.trim());
    }
    const selectedCities = citiesForGiftIntelSweep(rawCities);

    if (sweepMode === "occasions" || sweepMode === "upcoming_openings") {
      const result = await runOccasionIntelSweep({
        tenantId: ctx.tenantId,
        workspaceId: ctx.workspaceId,
        enabledSourceTiers,
        targetCities: selectedCities,
        families: sweepMode === "upcoming_openings" ? ["coming_soon"] : undefined,
      });
      return NextResponse.json(result);
    }

    const enrichment = await getResolvedEnrichmentConfigForWorkspace(ctx.workspaceId);
    const giftIntel = resolveGiftIntelConfig(enrichment);

    if (!giftIntel.configured) {
      return NextResponse.json(
        {
          error:
            "Brand Intelligence is not configured. Set product category and competitors in Settings → Enrichment or during onboarding.",
        },
        { status: 400 },
      );
    }

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

    const result = await runGiftIntelSweep({
      tenantId: ctx.tenantId,
      workspaceId: ctx.workspaceId,
      targetBrands: brands,
      targetCategory: giftIntel.productCategory,
      enabledSourceTiers,
      targetCities: selectedCities,
    });

    return NextResponse.json(result);
  } catch (e) {
    return handleApiError(e, "[api/agents/brand-intel/run]");
  }
}

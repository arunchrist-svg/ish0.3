import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { handleApiError } from "@/lib/api-errors";
import { getResolvedEnrichmentConfigForWorkspace } from "@/lib/settings/workspace-settings";
import { resolveGiftIntelConfig } from "@/lib/gift-intel/config";

export async function GET() {
  try {
    const ctx = await requireTenantContext();
    const enrichment = await getResolvedEnrichmentConfigForWorkspace(ctx.workspaceId);
    const giftIntel = resolveGiftIntelConfig(enrichment);
    return NextResponse.json(giftIntel);
  } catch (e) {
    return handleApiError(e, "[api/settings/gift-intel]");
  }
}

import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { getResolvedWorkspaceEnrichmentConfig } from "@/lib/settings/workspace-settings";
import { describeProviderChoice, SEARCH_PROVIDER_LABELS } from "@/lib/enrichment/config";
import { listDegradedProviders } from "@/lib/enrichment/provider-health";
import { checkDiscoveryPrerequisites } from "@/lib/enrichment/discovery-prerequisites";

/**
 * Provider status for the scout panel, read before a run.
 *
 * A degraded provider (Google Places daily quota, a rejected key) previously only showed up as
 * an empty result list after the user had already waited for a scout. Surfacing it up front
 * turns a mystery into a banner.
 */
export async function GET() {
  try {
    const ctx = await requireTenantContext();
    void ctx;
    const cfg = await getResolvedWorkspaceEnrichmentConfig();
    const degraded = listDegradedProviders();

    return NextResponse.json({
      provider: cfg.searchProvider,
      providerLabel: SEARCH_PROVIDER_LABELS[cfg.searchProvider]?.label ?? cfg.searchProvider,
      // Null when the configured provider is the one being used, so the UI can stay quiet.
      providerNotice:
        cfg.providerChoice && cfg.providerChoice.reason !== "configured"
          ? describeProviderChoice(cfg.providerChoice)
          : null,
      degraded: degraded.map((h) => ({
        provider: h.provider,
        label: SEARCH_PROVIDER_LABELS[h.provider]?.label ?? h.provider,
        state: h.state,
        message: h.message,
        since: h.since,
        expiresAt: h.expiresAt,
      })),
      prerequisites: checkDiscoveryPrerequisites(cfg),
    });
  } catch (e) {
    const { handleApiError } = await import("@/lib/api-errors");
    return handleApiError(e, "[api/scout/provider-health]");
  }
}

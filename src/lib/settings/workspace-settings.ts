import { db, workspaceSettings } from "@/db";
import type { EnrichmentConfig } from "@/lib/enrichment/config";
import { getEnrichmentConfig, resolveEnrichmentConfig } from "@/lib/enrichment/config";
import { normalizeScoutGeo } from "@/lib/geo/india";
import { normalizeScoutAreasOfFocus } from "@/lib/geo/area-of-focus";
import { requireTenantContext } from "@/lib/tenant";
import { eq } from "drizzle-orm";

export async function loadWorkspaceEnrichmentOverrides(): Promise<Partial<EnrichmentConfig>> {
  try {
    const { workspaceId } = await requireTenantContext();
    const [row] = await db
      .select()
      .from(workspaceSettings)
      .where(eq(workspaceSettings.workspaceId, workspaceId))
      .limit(1);

    return (row?.enrichmentConfig as Partial<EnrichmentConfig> | undefined) ?? {};
  } catch (e) {
    console.error("[workspace-settings] load failed:", e);
    return {};
  }
}

export async function saveWorkspaceEnrichmentOverrides(
  partial: Partial<EnrichmentConfig>,
): Promise<EnrichmentConfig> {
  const { workspaceId } = await requireTenantContext();
  const existing = await loadWorkspaceEnrichmentOverrides();
  const merged = { ...existing, ...partial };
  if (partial.scoutGeo !== undefined || existing.scoutGeo) {
    merged.scoutGeo = normalizeScoutGeo(merged.scoutGeo);
  }
  if (partial.scoutAreasOfFocus !== undefined) {
    merged.scoutAreasOfFocus = normalizeScoutAreasOfFocus(partial.scoutAreasOfFocus);
    merged.scoutAreaOfFocus = merged.scoutAreasOfFocus[0] ?? null;
  } else if (partial.scoutAreaOfFocus !== undefined) {
    merged.scoutAreasOfFocus = normalizeScoutAreasOfFocus(
      existing.scoutAreasOfFocus?.length ? existing.scoutAreasOfFocus : partial.scoutAreaOfFocus,
      existing.scoutAreasOfFocus?.length ? null : partial.scoutAreaOfFocus,
    );
    merged.scoutAreaOfFocus = merged.scoutAreasOfFocus[0] ?? null;
  } else if (existing.scoutAreasOfFocus?.length || existing.scoutAreaOfFocus) {
    merged.scoutAreasOfFocus = normalizeScoutAreasOfFocus(existing.scoutAreasOfFocus, existing.scoutAreaOfFocus);
    merged.scoutAreaOfFocus = merged.scoutAreasOfFocus[0] ?? null;
  }

  await db
    .insert(workspaceSettings)
    .values({
      workspaceId,
      enrichmentConfig: merged,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: workspaceSettings.workspaceId,
      set: {
        enrichmentConfig: merged,
        updatedAt: new Date(),
      },
    });

  return resolveEnrichmentConfig(merged.dataMode ?? getEnrichmentConfig().dataMode, merged);
}

export async function getResolvedWorkspaceEnrichmentConfig(
  override?: Partial<EnrichmentConfig>,
): Promise<EnrichmentConfig> {
  const stored = await loadWorkspaceEnrichmentOverrides();
  const dataMode = override?.dataMode ?? stored.dataMode ?? getEnrichmentConfig().dataMode;
  return resolveEnrichmentConfig(dataMode, { ...stored, ...override });
}

export async function loadEnrichmentOverridesForWorkspace(
  workspaceId: string,
): Promise<Partial<import("@/lib/enrichment/config").EnrichmentConfig>> {
  const [row] = await db
    .select()
    .from(workspaceSettings)
    .where(eq(workspaceSettings.workspaceId, workspaceId))
    .limit(1);

  return (row?.enrichmentConfig as Partial<import("@/lib/enrichment/config").EnrichmentConfig> | undefined) ?? {};
}

export async function getResolvedEnrichmentConfigForWorkspace(
  workspaceId: string,
): Promise<import("@/lib/enrichment/config").EnrichmentConfig> {
  const stored = await loadEnrichmentOverridesForWorkspace(workspaceId);
  const dataMode = stored.dataMode ?? getEnrichmentConfig().dataMode;
  return resolveEnrichmentConfig(dataMode, stored);
}

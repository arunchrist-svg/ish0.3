"use client";

import { SettingsGroup, SettingsGroupDivider, SettingsRow } from "@/components/settings/settings-group";
import { SettingsToggleRow } from "@/components/settings/settings-toggle-row";
import { SettingsNumberRow } from "@/components/settings/settings-number-row";
import { SettingsSegmented } from "@/components/settings/settings-segmented";
import { cn } from "@/lib/utils";
import { Check, ChevronDown, Loader2, Save } from "lucide-react";
import { useState } from "react";
import { BrandIntelligenceSetup } from "@/components/brand-intelligence/brand-intelligence-setup";
import { AreaOfInterestWizard } from "@/components/settings/area-of-interest-wizard";
import { DEFAULT_SCOUT_GEO, summarizeScoutGeo, type ScoutGeoSelection } from "@/lib/geo/india";
import {
  SEARCH_PROVIDER_LABELS,
  ENRICH_PROVIDER_LABELS,
  DATA_MODE_OPTIONS,
  SCOUT_VOLUME_PRESETS,
  MAX_SCOUT_COMPANIES_LIMIT,
  MAX_SCOUT_LEADS_LIMIT,
  type SearchProvider,
  type EnrichProvider,
  type EnrichmentConfig,
  type DataMode,
} from "@/lib/enrichment/config";

type Props = {
  config: EnrichmentConfig | null;
  scoutVolumeDirty: boolean;
  savingVolume: boolean;
  onUpdate: <K extends keyof EnrichmentConfig>(key: K, value: EnrichmentConfig[K]) => void;
  onUpdateScoutVolume: (partial: Pick<EnrichmentConfig, "scoutCompaniesLimit" | "scoutLeadsLimit">) => void;
  onSaveScoutVolume: () => void;
};

export function EnrichmentTab({
  config,
  scoutVolumeDirty,
  savingVolume,
  onUpdate,
  onUpdateScoutVolume,
  onSaveScoutVolume,
}: Props) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  if (!config) {
    return (
      <div className="flex flex-1 items-center justify-center py-16 text-[13px] text-brand-ink-faint">
        <Loader2 className="mr-2 size-4 animate-spin" /> Loading settings…
      </div>
    );
  }

  const searchProviders = Object.entries(SEARCH_PROVIDER_LABELS) as [
    SearchProvider,
    (typeof SEARCH_PROVIDER_LABELS)[SearchProvider],
  ][];
  const enrichProviders = Object.entries(ENRICH_PROVIDER_LABELS) as [
    EnrichProvider,
    (typeof ENRICH_PROVIDER_LABELS)[EnrichProvider],
  ][];

  const activeVolumeKey =
    (Object.entries(SCOUT_VOLUME_PRESETS) as [
      keyof typeof SCOUT_VOLUME_PRESETS,
      (typeof SCOUT_VOLUME_PRESETS)[keyof typeof SCOUT_VOLUME_PRESETS],
    ][]).find(
      ([, preset]) =>
        config.scoutCompaniesLimit === preset.companies && config.scoutLeadsLimit === preset.leads,
    )?.[0] ?? null;

  return (
    <div className="pb-6">
      <SettingsGroup title="Providers" className="mb-4">
        <SettingsRow className="justify-between py-2.5">
          <span className="text-[13px] font-semibold text-brand-ink">Company search</span>
          <SettingsSegmented
            value={config.searchProvider}
            onChange={(v) => onUpdate("searchProvider", v)}
            options={searchProviders.map(([value, meta]) => ({
              value,
              label: value === "india_directories" ? "India" : value === "google_places" ? "Places" : value === "tavily_ai" ? "Tavily" : "Apollo",
            }))}
          />
        </SettingsRow>
        <SettingsGroupDivider />
        <SettingsRow className="justify-between py-2.5">
          <span className="text-[13px] font-semibold text-brand-ink">Email enrich</span>
          <SettingsSegmented
            value={config.enrichProvider}
            onChange={(v) => onUpdate("enrichProvider", v)}
            options={enrichProviders.map(([value]) => ({
              value,
              label:
                value === "website_email"
                  ? "Website"
                  : value === "none"
                    ? "Skip"
                    : value === "hunter"
                      ? "Hunter"
                      : "Apollo",
            }))}
          />
        </SettingsRow>
        <SettingsGroupDivider />
        <SettingsRow className="justify-between py-2.5">
          <span className="text-[13px] font-semibold text-brand-ink">Data mode</span>
          <SettingsSegmented
            value={config.dataMode}
            onChange={(v) => onUpdate("dataMode", v as DataMode)}
            options={DATA_MODE_OPTIONS.map((mode) => ({ value: mode.value, label: mode.label }))}
          />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="Area of Interest" className="mb-4">
        <AreaOfInterestWizard
          key={summarizeScoutGeo(config.scoutGeo ?? DEFAULT_SCOUT_GEO)}
          value={config.scoutGeo ?? DEFAULT_SCOUT_GEO}
          onComplete={(next: ScoutGeoSelection) => onUpdate("scoutGeo", next)}
        />
      </SettingsGroup>

      <SettingsGroup title="Scout volume" className="mb-4">
        <SettingsRow className="justify-between py-2.5">
          <span className="text-[13px] font-semibold text-brand-ink">Preset</span>
          <SettingsSegmented
            value={activeVolumeKey ?? "custom"}
            onChange={(key) => {
              if (key === "custom") return;
              const preset = SCOUT_VOLUME_PRESETS[key as keyof typeof SCOUT_VOLUME_PRESETS];
              if (!preset) return;
              onUpdateScoutVolume({
                scoutCompaniesLimit: preset.companies,
                scoutLeadsLimit: preset.leads,
              });
            }}
            options={[
              ...(Object.entries(SCOUT_VOLUME_PRESETS) as [
                keyof typeof SCOUT_VOLUME_PRESETS,
                (typeof SCOUT_VOLUME_PRESETS)[keyof typeof SCOUT_VOLUME_PRESETS],
              ][]).map(([key, preset]) => ({ value: key, label: preset.label })),
              ...(activeVolumeKey ? [] : [{ value: "custom" as const, label: "Custom" }]),
            ]}
          />
        </SettingsRow>
        <SettingsGroupDivider />
        <SettingsNumberRow
          label="Companies / fetch"
          value={config.scoutCompaniesLimit}
          min={1}
          max={MAX_SCOUT_COMPANIES_LIMIT}
          onChange={(v) => onUpdateScoutVolume({ scoutCompaniesLimit: v, scoutLeadsLimit: config.scoutLeadsLimit })}
        />
        <SettingsGroupDivider />
        <SettingsNumberRow
          label="Leads / company"
          value={config.scoutLeadsLimit}
          min={1}
          max={MAX_SCOUT_LEADS_LIMIT}
          onChange={(v) => onUpdateScoutVolume({ scoutCompaniesLimit: config.scoutCompaniesLimit, scoutLeadsLimit: v })}
        />
        {(scoutVolumeDirty || savingVolume) && (
          <>
            <SettingsGroupDivider />
            <div className="px-4 py-2.5">
              <button
                type="button"
                onClick={onSaveScoutVolume}
                disabled={!scoutVolumeDirty || savingVolume}
                className={cn(
                  "flex w-full items-center justify-center gap-2 rounded-full py-2 text-[13px] font-semibold",
                  scoutVolumeDirty && !savingVolume
                    ? "bg-brand-black text-white hover:opacity-90"
                    : "bg-brand-canvas text-brand-ink-faint",
                )}
              >
                {savingVolume ? <Loader2 className="size-3.5 animate-spin" /> : scoutVolumeDirty ? <Save className="size-3.5" /> : <Check className="size-3.5" />}
                {savingVolume ? "Saving…" : "Save volume"}
              </button>
            </div>
          </>
        )}
      </SettingsGroup>

      <SettingsGroup title="Behaviour" className="mb-4">
        <SettingsToggleRow
          label="Fallback to AI"
          value={config.fallbackToAI}
          onChange={(v) => onUpdate("fallbackToAI", v)}
        />
        <SettingsGroupDivider />
        <SettingsToggleRow
          label="Auto-enrich on import"
          value={config.enrichOnImport}
          onChange={(v) => onUpdate("enrichOnImport", v)}
        />
      </SettingsGroup>

      <button
        type="button"
        onClick={() => setShowAdvanced((open) => !open)}
        className="mb-3 flex w-full items-center justify-between rounded-2xl border border-brand-stratus-blue/20 bg-white/70 px-4 py-2.5 text-[12px] font-semibold text-brand-ink-soft shadow-[var(--shadow-brand-sm)] backdrop-blur-sm hover:text-brand-ink"
      >
        Brand Intelligence
        <ChevronDown className={cn("size-3.5 transition-transform", showAdvanced && "rotate-180")} />
      </button>
      {showAdvanced ? (
        <SettingsGroup className="mb-4">
          <div className="px-4 py-3">
            <BrandIntelligenceSetup
              productCategory={config.giftIntelProductCategory ?? ""}
              competitorBrands={config.giftIntelCompetitorBrands ?? []}
              onProductCategoryChange={(v) => onUpdate("giftIntelProductCategory", v)}
              onCompetitorBrandsChange={(brands) => onUpdate("giftIntelCompetitorBrands", brands)}
              categoryDesc="Product type for competitor sweeps"
              competitorsDesc="Sweep targets on Brand Intelligence"
            />
          </div>
        </SettingsGroup>
      ) : null}
    </div>
  );
}

"use client";

import { SettingsGroup, SettingsGroupDivider, SettingsRow } from "@/components/settings/settings-group";
import { SettingsToggleRow } from "@/components/settings/settings-toggle-row";
import { SettingsNumberRow } from "@/components/settings/settings-number-row";
import { SettingsSegmented } from "@/components/settings/settings-segmented";
import { cn } from "@/lib/utils";
import { ChevronDown, Loader2 } from "lucide-react";
import { useState } from "react";
import { INDIA_STATE_ROWS } from "@/lib/geo/india-data";
import { BrandIntelligenceSetup } from "@/components/brand-intelligence/brand-intelligence-setup";
import { AreaOfInterestWizard } from "@/components/settings/area-of-interest-wizard";
import { AreaOfFocusSettings } from "@/components/settings/area-of-focus-settings";
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
  prospeoConfigured?: boolean;
  zintlrConfigured?: boolean;
  onUpdate: <K extends keyof EnrichmentConfig>(key: K, value: EnrichmentConfig[K]) => void;
  onUpdateScoutVolume: (partial: Pick<EnrichmentConfig, "scoutCompaniesLimit" | "scoutLeadsLimit">) => void;
};

export function EnrichmentTab({
  config,
  prospeoConfigured = false,
  zintlrConfigured = false,
  onUpdate,
  onUpdateScoutVolume,
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
                    : value === "prospeo"
                      ? "Prospeo"
                      : value === "hunter"
                        ? "Hunter"
                        : "Apollo",
            }))}
          />
        </SettingsRow>
        <SettingsGroupDivider />
        <SettingsRow className="justify-between py-2.5">
          <div className="min-w-0 flex-1 pr-4">
            <span className="text-[13px] font-semibold text-brand-ink">Business email finder</span>
            <p className="mt-0.5 text-[12px] leading-relaxed text-brand-ink-soft">
              {prospeoConfigured
                ? "Email-first: Prospeo finds verified work emails on lead save (LinkedIn preferred). Use Auto or Paid."
                : "Add PROSPEO_API_KEY in env to unlock verified email finder on save."}
            </p>
          </div>
          <span className="shrink-0 text-[12px] font-medium text-brand-ink-soft">
            {prospeoConfigured ? "Prospeo ready" : "Key missing"}
          </span>
        </SettingsRow>
        <SettingsRow className="justify-between py-2.5">
          <div className="min-w-0 flex-1 pr-4">
            <span className="text-[13px] font-semibold text-brand-ink">WhatsApp mobiles</span>
            <p className="mt-0.5 text-[12px] leading-relaxed text-brand-ink-soft">
              {zintlrConfigured
                ? "Optional. Zintlr unlocks India email + mobile from LinkedIn when Prospeo/Hunter miss."
                : "Optional. Add Zintlr keys if you want India LinkedIn email + WhatsApp mobile unlock."}
            </p>
          </div>
          <span className="shrink-0 text-[12px] font-medium text-brand-ink-soft">
            {zintlrConfigured ? "Zintlr ready" : "Skipped"}
          </span>
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

      <SettingsGroup
        title="Areas of focus"
        className="mb-4"
        footer="Add neighborhood clusters one by one. Each cluster appears in Scout under Focus Area. Leave empty to search the whole district."
      >
        <AreaOfFocusSettings
          scoutGeo={config.scoutGeo ?? DEFAULT_SCOUT_GEO}
          value={config.scoutAreasOfFocus?.length ? config.scoutAreasOfFocus : config.scoutAreaOfFocus ? [config.scoutAreaOfFocus] : []}
          onChange={(next) => {
            onUpdate("scoutAreasOfFocus", next);
            onUpdate("scoutAreaOfFocus", next[0] ?? null);
          }}
        />
      </SettingsGroup>

      <PeopleLocationSettings
        cities={config.scoutPeopleCities ?? []}
        onChange={(cities) => onUpdate("scoutPeopleCities", cities)}
      />

      <SettingsGroup
        title="Scout volume"
        className="mb-4"
        footer="Preset or custom limits for companies per fetch and leads per company. Saved with Enrichment settings."
      >
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
      </SettingsGroup>

      <SettingsGroup title="Behaviour" className="mb-4">
        <SettingsToggleRow
          label="Strict people filters"
          desc="When on, Fetch Leads uses only your seniority and department chips. No plant Manager bias, no pack expand, no empty-result broaden."
          value={Boolean(config.strictPeopleFilters)}
          onChange={(v) => onUpdate("strictPeopleFilters", v)}
        />
        <SettingsGroupDivider />
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

const PEOPLE_REGION_TABS = [
  { id: "south", label: "South India", shortLabel: "South" },
  { id: "north", label: "North India", shortLabel: "North" },
  { id: "west", label: "West India", shortLabel: "West" },
  { id: "central", label: "Central India", shortLabel: "Central" },
  { id: "east", label: "East India", shortLabel: "East" },
  { id: "northeast", label: "Northeast India", shortLabel: "NE" },
] as const;

function PeopleLocationSettings({
  cities,
  onChange,
}: {
  cities: string[];
  onChange: (cities: string[]) => void;
}) {
  const initTabId = (() => {
    const regionTab = PEOPLE_REGION_TABS.find((r) => r.label === cities[0]);
    if (regionTab) return regionTab.id;
    const stateRow = INDIA_STATE_ROWS.find((s) => s.name === cities[0]);
    return stateRow?.regionId ?? "south";
  })();
  const [tabId, setTabId] = useState<string>(initTabId);

  const isAuto = cities.length === 0;
  const isIndia = cities.length === 1 && /^entire india$/i.test(cities[0]);
  const withoutRegions = cities.filter((c) => !PEOPLE_REGION_TABS.some((r) => r.label === c));

  function handlePreset(mode: "auto" | "india") {
    onChange(mode === "india" ? ["Entire India"] : []);
  }

  function handleRegionClick(regionId: string) {
    const regionLabel = PEOPLE_REGION_TABS.find((r) => r.id === regionId)?.label ?? regionId;
    const wholeRegionSelected = cities.length === 1 && cities[0] === regionLabel;
    if (tabId === regionId && wholeRegionSelected) {
      onChange([]);
    } else {
      onChange([regionLabel]);
      setTabId(regionId);
    }
  }

  function handleStatePick(stateName: string) {
    const stateRow = INDIA_STATE_ROWS.find((s) => s.name === stateName);
    if (stateRow) setTabId(stateRow.regionId);
    const next = withoutRegions.includes(stateName)
      ? withoutRegions.filter((c) => c !== stateName)
      : [...withoutRegions, stateName];
    onChange(next);
  }

  return (
    <SettingsGroup
      title="People location"
      className="mb-4"
      footer="Default area filter for people scouting. Only contacts based in the selected state(s) or region will appear in Scout results."
    >
      <SettingsRow className="flex-col items-start gap-4 py-4">
        {/* Preset row */}
        <div className="flex flex-wrap gap-2">
          {(["auto", "india"] as const).map((preset) => {
            const active = preset === "auto" ? isAuto : isIndia;
            return (
              <button
                key={preset}
                type="button"
                onClick={() => handlePreset(preset)}
                className={cn(
                  "rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition-all duration-150",
                  active
                    ? "bg-brand-ink text-white shadow-sm"
                    : "bg-brand-app text-brand-ink-soft hover:bg-brand-border hover:text-brand-ink",
                )}
              >
                {preset === "auto" ? "Auto (no filter)" : "All India"}
              </button>
            );
          })}
        </div>

        {/* Region tabs */}
        <div className="w-full">
          <p className="mb-2 text-[11px] font-semibold text-brand-ink-faint">Or restrict to a region / state</p>
          <div className="mb-2.5 flex flex-wrap gap-1.5">
            {PEOPLE_REGION_TABS.map((region) => {
              const regionSelected = cities.length === 1 && cities[0] === region.label;
              const isActiveTab = tabId === region.id;
              return (
                <button
                  key={region.id}
                  type="button"
                  onClick={() => handleRegionClick(region.id)}
                  className={cn(
                    "rounded-lg px-3 py-1 text-[11.5px] font-semibold transition-all duration-150",
                    regionSelected
                      ? "bg-brand-green text-white"
                      : isActiveTab
                      ? "bg-brand-border text-brand-ink"
                      : "bg-brand-app text-brand-ink-soft hover:bg-brand-border hover:text-brand-ink",
                  )}
                >
                  {region.shortLabel}
                </button>
              );
            })}
          </div>

          {/* State chips for active tab */}
          <div className="flex flex-wrap gap-1.5">
            {INDIA_STATE_ROWS.filter((s) => s.regionId === tabId).map((state) => {
              const active = withoutRegions.includes(state.name);
              return (
                <button
                  key={state.id}
                  type="button"
                  onClick={() => handleStatePick(state.name)}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[11px] font-medium transition-all duration-150",
                    active
                      ? "bg-brand-ink text-white"
                      : "bg-brand-app text-brand-ink-soft hover:bg-brand-border hover:text-brand-ink",
                  )}
                >
                  {state.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Summary */}
        {!isAuto && (
          <p className="text-[11.5px] text-brand-ink-soft">
            {isIndia
              ? "All India contacts will appear, including Delhi and Mumbai."
              : `Scout will filter contacts to: ${cities.join(", ")}.`}
          </p>
        )}
      </SettingsRow>
    </SettingsGroup>
  );
}

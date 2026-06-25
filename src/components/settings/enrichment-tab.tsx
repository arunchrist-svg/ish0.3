"use client";

import { SettingsGroup, SettingsGroupDivider } from "@/components/settings/settings-group";
import { SettingsSelectRow } from "@/components/settings/settings-select-row";
import { SettingsProviderRow } from "@/components/settings/settings-provider-row";
import { SettingsToggleRow } from "@/components/settings/settings-toggle-row";
import { SettingsNumberRow } from "@/components/settings/settings-number-row";
import { cn } from "@/lib/utils";
import { Check, Loader2, Save } from "lucide-react";
import {
  SEARCH_PROVIDER_LABELS,
  ENRICH_PROVIDER_LABELS,
  DATA_MODE_OPTIONS,
  SCOUT_VOLUME_PRESETS,
  type SearchProvider,
  type EnrichProvider,
  type EnrichmentConfig,
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
  if (!config) {
    return (
      <div className="flex flex-1 items-center justify-center py-24 text-[13px] text-ish-ink-faint">
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

  return (
    <div className="pb-8">
      <SettingsGroup
        title="Company Search"
        footer="How Scout discovers companies. Use India Directories for testing; Apollo for production."
      >
        {searchProviders.map(([value, meta], i) => (
          <SettingsProviderRow
            key={value}
            value={value}
            selected={config.searchProvider === value}
            label={meta.label}
            desc={meta.desc}
            badge={meta.badge}
            onSelect={(v) => onUpdate("searchProvider", v)}
            showDivider={i > 0}
          />
        ))}
      </SettingsGroup>

      <SettingsGroup
        title="Email Enrichment"
        footer="How Scout finds contact emails. Website scrape works well for Indian SMBs."
      >
        {enrichProviders.map(([value, meta], i) => (
          <SettingsProviderRow
            key={value}
            value={value}
            selected={config.enrichProvider === value}
            label={meta.label}
            desc={meta.desc}
            badge={meta.badge}
            onSelect={(v) => onUpdate("enrichProvider", v)}
            showDivider={i > 0}
          />
        ))}
      </SettingsGroup>

      <SettingsGroup
        title="Data Mode"
        footer="Paid enrichment (Apollo / Hunter) runs per lead from the record view."
      >
        {DATA_MODE_OPTIONS.map((mode, i) => (
          <SettingsSelectRow
            key={mode.value}
            label={mode.label}
            desc={mode.desc}
            selected={config.dataMode === mode.value}
            onSelect={() => onUpdate("dataMode", mode.value)}
            showDivider={i > 0}
          />
        ))}
      </SettingsGroup>

      <SettingsGroup
        title="Scout Volume"
        footer={
          scoutVolumeDirty
            ? "Unsaved changes — scouting uses the previous limits until you save."
            : "Scout volume applies to your next run. Higher volume uses more credits."
        }
      >
        {(Object.entries(SCOUT_VOLUME_PRESETS) as [
            keyof typeof SCOUT_VOLUME_PRESETS,
            (typeof SCOUT_VOLUME_PRESETS)[keyof typeof SCOUT_VOLUME_PRESETS],
          ][]).map(([key, preset], i) => (
            <SettingsSelectRow
              key={key}
              label={preset.label}
              desc={`${preset.companies} companies · ${preset.leads} leads — ${preset.desc}`}
              selected={
                config.scoutCompaniesLimit === preset.companies &&
                config.scoutLeadsLimit === preset.leads
              }
              onSelect={() =>
                onUpdateScoutVolume({
                  scoutCompaniesLimit: preset.companies,
                  scoutLeadsLimit: preset.leads,
                })
              }
              showDivider={i > 0}
            />
          ))}

        <SettingsGroupDivider />

        <SettingsNumberRow
          label="Companies per fetch"
          desc="Max companies each time you fetch new companies."
          value={config.scoutCompaniesLimit}
          min={1}
          max={100}
          onChange={(v) => onUpdateScoutVolume({ scoutCompaniesLimit: v, scoutLeadsLimit: config.scoutLeadsLimit })}
        />

        <SettingsGroupDivider />

        <SettingsNumberRow
          label="Leads per company"
          desc="Max people discovered per company when scouting leads."
          value={config.scoutLeadsLimit}
          min={1}
          max={25}
          onChange={(v) => onUpdateScoutVolume({ scoutCompaniesLimit: config.scoutCompaniesLimit, scoutLeadsLimit: v })}
        />

        {(scoutVolumeDirty || savingVolume) && (
          <>
            <SettingsGroupDivider />
            <div className="px-4 py-3">
              <button
                type="button"
                onClick={onSaveScoutVolume}
                disabled={!scoutVolumeDirty || savingVolume}
                className={cn(
                  "flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-[14px] font-semibold transition-all",
                  scoutVolumeDirty && !savingVolume
                    ? "bg-ish-black text-white hover:opacity-90"
                    : "bg-ish-canvas text-ish-ink-faint",
                )}
              >
                {savingVolume ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : scoutVolumeDirty ? (
                  <Save className="size-4" />
                ) : (
                  <Check className="size-4" />
                )}
                {savingVolume ? "Saving…" : "Save Scout Volume"}
              </button>
            </div>
          </>
        )}
      </SettingsGroup>

      <SettingsGroup title="Behaviour">
        <SettingsToggleRow
          label="Fallback to AI"
          desc="Try Tavily + Gemini when the primary provider returns fewer than 50% of results."
          value={config.fallbackToAI}
          onChange={(v) => onUpdate("fallbackToAI", v)}
        />
        <SettingsGroupDivider />
        <SettingsToggleRow
          label="Auto-enrich on import"
          desc="Enrich emails immediately when a lead is saved from Scout."
          value={config.enrichOnImport}
          onChange={(v) => onUpdate("enrichOnImport", v)}
        />
      </SettingsGroup>

    </div>
  );
}

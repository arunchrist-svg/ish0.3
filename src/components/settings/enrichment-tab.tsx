"use client";

import { DataModeSegmentedControl } from "@/design-system";
import { SettingsSection } from "@/components/settings/settings-section";
import { ProviderCard } from "@/components/settings/provider-card";
import { SettingsToggleRow } from "@/components/settings/settings-toggle-row";
import { SettingsNumberRow } from "@/components/settings/settings-number-row";
import { ActiveConfigSummary } from "@/components/settings/active-config-summary";
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

  return (
    <div className="grid grid-cols-12 gap-4">
      <SettingsSection
        className="col-span-12 lg:col-span-6"
        title="Company Search Provider"
        description="How Scout discovers companies. For testing, use India Directories (free). Switch to Apollo for production."
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {(Object.entries(SEARCH_PROVIDER_LABELS) as [SearchProvider, (typeof SEARCH_PROVIDER_LABELS)[SearchProvider]][]).map(
            ([value, meta]) => (
              <ProviderCard
                key={value}
                value={value}
                selected={config.searchProvider === value}
                label={meta.label}
                desc={meta.desc}
                badge={meta.badge}
                onSelect={(v) => onUpdate("searchProvider", v)}
              />
            ),
          )}
        </div>
      </SettingsSection>

      <SettingsSection
        className="col-span-12 lg:col-span-6"
        title="Email Enrichment Provider"
        description="How Scout finds contact email addresses. Website scrape is free for Indian SMBs."
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {(Object.entries(ENRICH_PROVIDER_LABELS) as [EnrichProvider, (typeof ENRICH_PROVIDER_LABELS)[EnrichProvider]][]).map(
            ([value, meta]) => (
              <ProviderCard
                key={value}
                value={value}
                selected={config.enrichProvider === value}
                label={meta.label}
                desc={meta.desc}
                badge={meta.badge}
                onSelect={(v) => onUpdate("enrichProvider", v)}
              />
            ),
          )}
        </div>
      </SettingsSection>

      <SettingsSection
        className="col-span-12 lg:col-span-7"
        title="Data Mode"
        description="Controls which providers Scout uses for company search and email enrichment."
        tone="yellow"
      >
        <DataModeSegmentedControl value={config.dataMode} onChange={(mode) => onUpdate("dataMode", mode)} />
        <p className="mt-3 text-[11px] text-ish-ink-faint">
          {DATA_MODE_OPTIONS.map((mode) => `${mode.label} → ${mode.desc}`).join(" · ")}
        </p>
        <p className="mt-2 text-[11px] text-ish-ink-faint">
          Paid enrichment (Apollo / Hunter) runs per lead via the Enrich button on the lead record.
        </p>
      </SettingsSection>

      <SettingsSection
        className="col-span-12 lg:col-span-5"
        title="Scout Volume Presets"
        description="Quick caps for companies and leads per scout run."
      >
        <div className="flex flex-col gap-2">
          {(Object.entries(SCOUT_VOLUME_PRESETS) as [keyof typeof SCOUT_VOLUME_PRESETS, (typeof SCOUT_VOLUME_PRESETS)[keyof typeof SCOUT_VOLUME_PRESETS]][]).map(
            ([key, preset]) => {
              const active =
                config.scoutCompaniesLimit === preset.companies && config.scoutLeadsLimit === preset.leads;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() =>
                    onUpdateScoutVolume({
                      scoutCompaniesLimit: preset.companies,
                      scoutLeadsLimit: preset.leads,
                    })
                  }
                  className={cn(
                    "rounded-[14px] border px-3 py-2.5 text-left transition-all",
                    active
                      ? "border-ish-black bg-ish-black text-white"
                      : "border-ish-border bg-white text-ish-ink hover:border-ish-ink-faint",
                  )}
                >
                  <div className="text-[12px] font-bold">{preset.label}</div>
                  <div className={cn("text-[10px]", active ? "text-white/80" : "text-ish-ink-soft")}>{preset.desc}</div>
                  <div className={cn("mt-0.5 text-[10px] font-medium", active ? "text-white/90" : "text-ish-ink-faint")}>
                    {preset.companies} cos · {preset.leads} leads
                  </div>
                </button>
              );
            },
          )}
        </div>
      </SettingsSection>

      <SettingsSection
        className="col-span-12"
        title="Scout Volume Limits"
        description="Fine-tune limits. Add TAVILY_API_KEY_2 in .env.local for automatic key rotation."
        contentClassName="space-y-3"
      >
        <SettingsNumberRow
          label="Companies per fetch"
          desc="Maximum companies returned each time you click Fetch New Companies."
          value={config.scoutCompaniesLimit}
          min={1}
          max={100}
          suffix="max"
          onChange={(v) => onUpdateScoutVolume({ scoutCompaniesLimit: v, scoutLeadsLimit: config.scoutLeadsLimit })}
        />
        <SettingsNumberRow
          label="Leads per company"
          desc="Maximum people discovered per company when you scout leads."
          value={config.scoutLeadsLimit}
          min={1}
          max={25}
          suffix="max"
          onChange={(v) => onUpdateScoutVolume({ scoutCompaniesLimit: config.scoutCompaniesLimit, scoutLeadsLimit: v })}
        />
        <div className="flex items-center justify-between gap-3 rounded-[14px] border border-dashed border-ish-border bg-ish-app/50 px-4 py-3">
          <p className="text-[12px] text-ish-ink-soft">
            {scoutVolumeDirty
              ? "Unsaved scout volume — scouting will use the old limits until you save."
              : "Scout volume is saved and active on the Scouting page."}
          </p>
          <button
            type="button"
            onClick={onSaveScoutVolume}
            disabled={!scoutVolumeDirty || savingVolume}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-[12px] px-4 py-2 text-[12px] font-bold transition-all",
              scoutVolumeDirty && !savingVolume
                ? "bg-ish-black text-white hover:opacity-90"
                : "border border-ish-border bg-white text-ish-ink-faint",
            )}
          >
            {savingVolume ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : scoutVolumeDirty ? (
              <Save className="size-3.5" />
            ) : (
              <Check className="size-3.5" />
            )}
            {savingVolume ? "Saving…" : scoutVolumeDirty ? "Save scout volume" : "Saved"}
          </button>
        </div>
      </SettingsSection>

      <SettingsSection className="col-span-12 lg:col-span-6" title="Behaviour" contentClassName="space-y-3">
        <SettingsToggleRow
          label="Fallback to AI (Tavily + Gemini)"
          desc="If the primary search provider returns fewer than 50% of requested results, automatically try Tavily+Gemini as a fallback."
          value={config.fallbackToAI}
          onChange={(v) => onUpdate("fallbackToAI", v)}
        />
        <SettingsToggleRow
          label="Auto-enrich on import"
          desc="Run email enrichment immediately when a lead is saved from Scout."
          value={config.enrichOnImport}
          onChange={(v) => onUpdate("enrichOnImport", v)}
        />
      </SettingsSection>

      <div className="col-span-12 lg:col-span-6">
        <ActiveConfigSummary config={config} />
      </div>
    </div>
  );
}

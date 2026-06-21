"use client";

import { useEffect, useState } from "react";
import { AppShell, DataModeSegmentedControl, text } from "@/design-system";
import { TopBar } from "@/components/sales-accelerator/top-bar";
import { SideNav } from "@/components/sales-accelerator/side-nav";
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
import { toast } from "sonner";

export default function SettingsPage() {
  const [config, setConfig] = useState<EnrichmentConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [scoutVolumeDirty, setScoutVolumeDirty] = useState(false);
  const [savingVolume, setSavingVolume] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => setConfig(data));
  }, []);

  function update<K extends keyof EnrichmentConfig>(key: K, value: EnrichmentConfig[K]) {
    setConfig((prev) => (prev ? { ...prev, [key]: value } : prev));
    setDirty(true);
  }

  function updateScoutVolume(partial: Pick<EnrichmentConfig, "scoutCompaniesLimit" | "scoutLeadsLimit">) {
    setConfig((prev) => (prev ? { ...prev, ...partial } : prev));
    setScoutVolumeDirty(true);
    setDirty(true);
  }

  async function saveScoutVolume() {
    if (!config) return;
    setSavingVolume(true);
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scoutCompaniesLimit: config.scoutCompaniesLimit,
          scoutLeadsLimit: config.scoutLeadsLimit,
        }),
      });
      setScoutVolumeDirty(false);
      window.dispatchEvent(
        new CustomEvent("scout-volume-updated", {
          detail: {
            scoutCompaniesLimit: config.scoutCompaniesLimit,
            scoutLeadsLimit: config.scoutLeadsLimit,
          },
        }),
      );
      toast.success("Scout volume saved — applies to the next scout run");
    } catch {
      toast.error("Could not save scout volume");
    } finally {
      setSavingVolume(false);
    }
  }

  async function save() {
    if (!config) return;
    setSaving(true);
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      setDirty(false);
      setScoutVolumeDirty(false);
      window.dispatchEvent(
        new CustomEvent("scout-volume-updated", {
          detail: {
            scoutCompaniesLimit: config.scoutCompaniesLimit,
            scoutLeadsLimit: config.scoutLeadsLimit,
          },
        }),
      );
      toast.success("Settings saved — applies to next Scout run");
    } catch {
      toast.error("Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (!config) {
    return (
      <AppShell>
        <TopBar />
        <div className="flex" style={{ minHeight: "calc(100vh - 116px)" }}>
          <SideNav />
          <div className="flex flex-1 items-center justify-center text-[13px] text-ish-ink-faint">
            <Loader2 className="mr-2 size-4 animate-spin" /> Loading settings…
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <TopBar />
      <div className="flex" style={{ minHeight: "calc(100vh - 116px)" }}>
        <SideNav />
        <div className="min-w-0 flex-1 overflow-y-auto bg-ish-app p-8">
          <div className="mb-8 flex items-start justify-between">
            <div>
              <h1 className={text.display}>Enrichment Settings</h1>
              <p className={cn("mt-1", text.bodySoft)}>
                Choose how Scout discovers companies and finds contact emails
              </p>
            </div>
            <button
              type="button"
              onClick={save}
              disabled={!dirty || saving}
              className={cn(
                "flex items-center gap-2 rounded-[14px] px-5 py-2.5 text-[13px] font-bold text-white transition-all",
                dirty && !saving ? "bg-ish-black hover:opacity-90" : "bg-ish-ink-faint opacity-50 cursor-not-allowed",
              )}
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>

          <SettingsSection
            title="Company Search Provider"
            description="How Scout discovers companies. For testing, use India Directories (free). Switch to Apollo for production quality data."
          >
            <div className="grid grid-cols-2 gap-3">
              {(Object.entries(SEARCH_PROVIDER_LABELS) as [SearchProvider, typeof SEARCH_PROVIDER_LABELS[SearchProvider]][]).map(
                ([value, meta]) => (
                  <ProviderCard
                    key={value}
                    value={value}
                    selected={config.searchProvider === value}
                    label={meta.label}
                    desc={meta.desc}
                    badge={meta.badge}
                    onSelect={(v) => update("searchProvider", v)}
                  />
                ),
              )}
            </div>
          </SettingsSection>

          <SettingsSection
            title="Email Enrichment Provider"
            description="How Scout finds contact email addresses. Website scrape is free and works well for Indian SMBs."
          >
            <div className="grid grid-cols-2 gap-3">
              {(Object.entries(ENRICH_PROVIDER_LABELS) as [EnrichProvider, typeof ENRICH_PROVIDER_LABELS[EnrichProvider]][]).map(
                ([value, meta]) => (
                  <ProviderCard
                    key={value}
                    value={value}
                    selected={config.enrichProvider === value}
                    label={meta.label}
                    desc={meta.desc}
                    badge={meta.badge}
                    onSelect={(v) => update("enrichProvider", v)}
                  />
                ),
              )}
            </div>
          </SettingsSection>

          <SettingsSection
            title="Data Mode"
            description="Controls which providers Scout uses for company search and email enrichment. Saved here applies to all Scout runs."
          >
            <DataModeSegmentedControl
              value={config.dataMode}
              onChange={(mode) => update("dataMode", mode)}
            />
            <p className="mt-3 text-[11px] text-ish-ink-faint">
              {DATA_MODE_OPTIONS.map((mode) => `${mode.label} → ${mode.desc}`).join(" · ")}
            </p>            <p className="mt-2 text-[11px] text-ish-ink-faint">
              Paid enrichment (Apollo / Hunter) runs per lead via the Enrich (Paid) button on the lead record — not automatically on every scout save.
            </p>
          </SettingsSection>

          <SettingsSection
            title="Scout Volume"
            description="Cap how many companies and leads each scout run fetches. Lower limits save Tavily credits and Gemini tokens. Save here before scouting. Add a backup Tavily key as TAVILY_API_KEY_2 in .env.local — the app rotates automatically when the primary key hits quota."
            contentClassName="space-y-3"
          >
            <div className="flex flex-wrap gap-2">
              {(Object.entries(SCOUT_VOLUME_PRESETS) as [keyof typeof SCOUT_VOLUME_PRESETS, typeof SCOUT_VOLUME_PRESETS[keyof typeof SCOUT_VOLUME_PRESETS]][]).map(
                ([key, preset]) => {
                  const active =
                    config.scoutCompaniesLimit === preset.companies &&
                    config.scoutLeadsLimit === preset.leads;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() =>
                        updateScoutVolume({
                          scoutCompaniesLimit: preset.companies,
                          scoutLeadsLimit: preset.leads,
                        })
                      }
                      className={cn(
                        "rounded-[14px] border px-4 py-2.5 text-left transition-all",
                        active
                          ? "border-ish-black bg-ish-black text-white"
                          : "border-ish-border bg-white text-ish-ink hover:border-ish-ink-faint",
                      )}
                    >
                      <div className="text-[13px] font-bold">{preset.label}</div>
                      <div className={cn("text-[11px]", active ? "text-white/80" : "text-ish-ink-soft")}>{preset.desc}</div>
                      <div className={cn("mt-1 text-[11px] font-medium", active ? "text-white/90" : "text-ish-ink-faint")}>
                        {preset.companies} companies · {preset.leads} leads / company
                      </div>
                    </button>
                  );
                },
              )}
            </div>
            <SettingsNumberRow
              label="Companies per fetch"
              desc="Maximum companies returned each time you click Fetch New Companies."
              value={config.scoutCompaniesLimit}
              min={1}
              max={100}
              suffix="max"
              onChange={(v) => updateScoutVolume({ scoutCompaniesLimit: v, scoutLeadsLimit: config.scoutLeadsLimit })}
            />
            <SettingsNumberRow
              label="Leads per company"
              desc="Maximum people discovered per company when you scout leads (Tavily + Gemini per company)."
              value={config.scoutLeadsLimit}
              min={1}
              max={25}
              suffix="max"
              onChange={(v) => updateScoutVolume({ scoutCompaniesLimit: config.scoutCompaniesLimit, scoutLeadsLimit: v })}
            />
            <div className="flex items-center justify-between gap-3 rounded-[14px] border border-dashed border-ish-border bg-ish-app/50 px-4 py-3">
              <p className="text-[12px] text-ish-ink-soft">
                {scoutVolumeDirty
                  ? "Unsaved scout volume — scouting will use the old limits until you save."
                  : "Scout volume is saved and active on the Scouting page."}
              </p>
              <button
                type="button"
                onClick={saveScoutVolume}
                disabled={!scoutVolumeDirty || savingVolume}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-[12px] px-4 py-2 text-[12px] font-bold transition-all",
                  scoutVolumeDirty && !savingVolume
                    ? "bg-ish-black text-white hover:opacity-90"
                    : "bg-white text-ish-ink-faint border border-ish-border",
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

          <SettingsSection title="Behaviour" contentClassName="space-y-3">
            <SettingsToggleRow
              label="Fallback to AI (Tavily + Gemini)"
              desc="If the primary search provider returns fewer than 50% of requested results, automatically try Tavily+Gemini as a fallback."
              value={config.fallbackToAI}
              onChange={(v) => update("fallbackToAI", v)}
            />
            <SettingsToggleRow
              label="Auto-enrich on import"
              desc="Run email enrichment immediately when a lead is saved from Scout. Slower saves but emails are ready faster."
              value={config.enrichOnImport}
              onChange={(v) => update("enrichOnImport", v)}
            />
          </SettingsSection>

          <ActiveConfigSummary config={config} />
        </div>
      </div>
    </AppShell>
  );
}

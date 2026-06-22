"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { text } from "@/design-system";
import { SettingsNav, type SettingsNavItem } from "@/components/settings/settings-nav";
import { EnrichmentTab } from "@/components/settings/enrichment-tab";
import { AppearanceTab } from "@/components/settings/appearance-tab";
import { AiUsageTab } from "@/components/settings/ai-usage-tab";
import { LinkedInIntegration } from "@/components/settings/linkedin-integration";
import { cn } from "@/lib/utils";
import { Loader2, Palette, Plug, Save, Sparkles, Wrench } from "lucide-react";
import type { EnrichmentConfig } from "@/lib/enrichment/config";
import { toast } from "sonner";

const NAV_ITEMS: SettingsNavItem[] = [
  { value: "enrichment", label: "Enrichment", icon: Wrench },
  { value: "integrations", label: "Integrations", icon: Plug },
  { value: "ai-usage", label: "AI Usage", icon: Sparkles },
  { value: "appearance", label: "Appearance", icon: Palette },
];

const TAB_SUBTITLES: Record<string, string> = {
  enrichment: "Configure search, enrichment, and scout volume",
  integrations: "LinkedIn and external connections",
  "ai-usage": "Live credit meters and AI service status",
  appearance: "Theme and visual preferences",
};

function SettingsAppInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState(() => searchParams.get("tab") ?? "enrichment");
  const [config, setConfig] = useState<EnrichmentConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [scoutVolumeDirty, setScoutVolumeDirty] = useState(false);
  const [savingVolume, setSavingVolume] = useState(false);

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab) setActiveTab(tab);
  }, [searchParams]);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => setConfig(data));
  }, []);

  const handleTabChange = useCallback(
    (tab: string) => {
      setActiveTab(tab);
      router.replace(`/settings?tab=${tab}`, { scroll: false });
    },
    [router],
  );

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

  return (
    <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
      <SettingsNav value={activeTab} onChange={handleTabChange} items={NAV_ITEMS} />

      <div className="settings-content flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex shrink-0 items-start justify-between border-b border-ish-border/60 bg-white/76 px-[26px] py-5 backdrop-blur-md">
          <div>
            <h1 className={text.display}>{NAV_ITEMS.find((i) => i.value === activeTab)?.label ?? "Settings"}</h1>
            <p className={cn("mt-1", text.bodySoft)}>{TAB_SUBTITLES[activeTab] ?? ""}</p>
          </div>
          {activeTab === "enrichment" && (
            <button
              type="button"
              onClick={save}
              disabled={!dirty || saving || !config}
              className={cn(
                "flex items-center gap-2 rounded-[14px] px-5 py-2.5 text-[13px] font-bold text-white transition-all",
                dirty && !saving && config ? "bg-ish-black hover:opacity-90" : "cursor-not-allowed bg-ish-ink-faint opacity-50",
              )}
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              {saving ? "Saving…" : "Save Changes"}
            </button>
          )}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-[22px_26px]">
          {activeTab === "enrichment" && (
            <EnrichmentTab
              config={config}
              scoutVolumeDirty={scoutVolumeDirty}
              savingVolume={savingVolume}
              onUpdate={update}
              onUpdateScoutVolume={updateScoutVolume}
              onSaveScoutVolume={saveScoutVolume}
            />
          )}

          {activeTab === "integrations" && (
            <Suspense fallback={<div className="py-12 text-center text-ish-ink-faint">Loading…</div>}>
              <LinkedInIntegration />
            </Suspense>
          )}

          {activeTab === "ai-usage" && <AiUsageTab />}

          {activeTab === "appearance" && <AppearanceTab />}
        </div>
      </div>
    </div>
  );
}

export function SettingsApp() {
  return (
    <Suspense fallback={<div className="min-w-0 flex-1 p-8 text-ish-ink-faint">Loading settings…</div>}>
      <SettingsAppInner />
    </Suspense>
  );
}

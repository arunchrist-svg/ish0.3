"use client";

import { useEffect, useState } from "react";
import { SettingsGroup, SettingsRow } from "@/components/settings/settings-group";
import { SettingsToggleRow } from "@/components/settings/settings-toggle-row";
import { SettingsStickySaveBar } from "@/components/settings/settings-sticky-save-bar";
import type { FestiveSettings } from "@/app/api/settings/festive/route";

const DEFAULT: FestiveSettings = { festiveTarget: 0, festiveCapacity: 0, whatsAppFirst: false };

export function FestiveTab() {
  const [cfg, setCfg] = useState<FestiveSettings>(DEFAULT);
  const [saved, setSaved] = useState<FestiveSettings>(DEFAULT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings/festive")
      .then((r) => r.json())
      .then((d: FestiveSettings) => {
        setCfg(d);
        setSaved(d);
      })
      .finally(() => setLoading(false));
  }, []);

  const dirty =
    cfg.festiveTarget !== saved.festiveTarget ||
    cfg.festiveCapacity !== saved.festiveCapacity ||
    cfg.whatsAppFirst !== saved.whatsAppFirst;

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/festive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cfg),
      });
      if (!res.ok) throw new Error(await res.text());
      const next: FestiveSettings = await res.json();
      setCfg(next);
      setSaved(next);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="py-12 text-center text-[13px] text-brand-ink-faint">Loading…</div>;

  return (
    <div className="relative pb-24">
      <SettingsGroup title="Outreach channel">
        <SettingsToggleRow
          label="WhatsApp-first mode"
          desc="Send WhatsApp immediately after email 1, not after email 2. Activate during the festive window when procurement moves to WhatsApp."
          value={cfg.whatsAppFirst}
          onChange={(v) => setCfg((c) => ({ ...c, whatsAppFirst: v }))}
        />
      </SettingsGroup>

      <SettingsGroup title="Season targets">
        <SettingsRow className="flex-col items-start gap-2">
          <div>
            <div className="text-[15px] font-medium text-brand-ink">Revenue target (₹)</div>
            <p className="mt-0.5 text-[12px] text-brand-ink-soft">Season booking goal shown on the War Room dashboard.</p>
          </div>
          <input
            type="number"
            min={0}
            value={cfg.festiveTarget || ""}
            onChange={(e) => setCfg((c) => ({ ...c, festiveTarget: Number(e.target.value) || 0 }))}
            placeholder="e.g. 5000000"
            className="w-full rounded-[10px] border border-brand-border bg-brand-app px-3 py-2 text-[14px] text-brand-ink placeholder:text-brand-ink-faint focus:outline-none focus:ring-2 focus:ring-brand-black"
          />
        </SettingsRow>

        <SettingsRow className="flex-col items-start gap-2">
          <div>
            <div className="text-[15px] font-medium text-brand-ink">Production capacity (boxes)</div>
            <p className="mt-0.5 text-[12px] text-brand-ink-soft">Total boxes the kitchen can produce this season. Drives the capacity burn-down meter.</p>
          </div>
          <input
            type="number"
            min={0}
            value={cfg.festiveCapacity || ""}
            onChange={(e) => setCfg((c) => ({ ...c, festiveCapacity: Number(e.target.value) || 0 }))}
            placeholder="e.g. 10000"
            className="w-full rounded-[10px] border border-brand-border bg-brand-app px-3 py-2 text-[14px] text-brand-ink placeholder:text-brand-ink-faint focus:outline-none focus:ring-2 focus:ring-brand-black"
          />
        </SettingsRow>
      </SettingsGroup>

      <SettingsStickySaveBar
        visible={dirty}
        saving={saving}
        onSave={handleSave}
        hint="Applies immediately to new outreach"
      />
    </div>
  );
}

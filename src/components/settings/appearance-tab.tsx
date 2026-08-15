"use client";

import { Check } from "lucide-react";
import { SettingsGroup, SettingsGroupDivider, SettingsRow } from "@/components/settings/settings-group";
import { stratusGradient } from "@/design-system";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/providers/theme-provider";

export function AppearanceTab() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <div className="pb-6">
      <SettingsGroup title="Theme" className="mb-4">
        <SettingsRow onClick={() => setTheme("light")} className="justify-between py-3">
          <div className="flex items-center gap-3">
            <div className="flex gap-1">
              <span className="size-3.5 rounded-full bg-brand-ink" />
              <span className="size-3.5 rounded-full bg-brand-yellow" />
              <span className="size-3.5 rounded-full bg-brand-green" />
            </div>
            <div>
              <p className="text-[13px] font-semibold text-brand-ink">Light</p>
              <p className="text-[11px] text-brand-ink-soft">Clean white canvas</p>
            </div>
          </div>
          <div
            className={cn(
              "flex size-5 items-center justify-center rounded-full border-2",
              resolvedTheme === "light" ? "border-brand-black bg-brand-black text-white" : "border-brand-border",
            )}
          >
            {resolvedTheme === "light" ? <Check className="size-3" strokeWidth={3} /> : null}
          </div>
        </SettingsRow>
        <SettingsGroupDivider />
        <SettingsRow onClick={() => setTheme("stratus")} className="justify-between py-3">
          <div className="flex items-center gap-3">
            <div className="size-5 overflow-hidden rounded-full shadow-[var(--shadow-brand-sm)]" style={{ background: stratusGradient }} />
            <div>
              <p className="text-[13px] font-semibold text-brand-ink">Stratus</p>
              <p className="text-[11px] text-brand-ink-soft">Blue · Salmon · Yellow glass</p>
            </div>
          </div>
          <div
            className={cn(
              "flex size-5 items-center justify-center rounded-full border-2",
              resolvedTheme === "stratus" ? "border-brand-black bg-brand-black text-white" : "border-brand-border",
            )}
          >
            {resolvedTheme === "stratus" ? <Check className="size-3" strokeWidth={3} /> : null}
          </div>
        </SettingsRow>
      </SettingsGroup>
    </div>
  );
}

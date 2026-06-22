"use client";

import { Check } from "lucide-react";
import { SettingsGroup, SettingsGroupDivider, SettingsRow } from "@/components/settings/settings-group";
import { stratusPalette, stratusGradient, stratusPaletteLegend } from "@/design-system";
import { cn } from "@/lib/utils";
import { useTheme } from "next-themes";

function ThemeSwatch({ colors }: { colors: string[] }) {
  return (
    <div className="flex gap-1.5">
      {colors.map((c) => (
        <span key={c} className="size-4 rounded-full border border-black/5" style={{ backgroundColor: c }} />
      ))}
    </div>
  );
}

export function AppearanceTab() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <>
      <SettingsGroup title="Appearance" footer="Your preference is saved in the browser.">
        <SettingsRow onClick={() => setTheme("light")} className="justify-between">
          <div className="flex items-center gap-3">
            <ThemeSwatch colors={["#1a1a1f", "#ffce87", "#83a2db"]} />
            <div>
              <p className="text-[15px] font-medium text-ish-ink">Light</p>
              <p className="text-[12px] text-ish-ink-soft">Clean white canvas</p>
            </div>
          </div>
          <div
            className={cn(
              "flex size-6 items-center justify-center rounded-full border-2",
              resolvedTheme === "light" ? "border-ish-black bg-ish-black text-white" : "border-ish-border",
            )}
          >
            {resolvedTheme === "light" ? <Check className="size-3.5" strokeWidth={3} /> : null}
          </div>
        </SettingsRow>

        <SettingsGroupDivider />

        <SettingsRow onClick={() => setTheme("stratus")} className="justify-between">
          <div className="flex items-center gap-3">
            <div
              className="flex size-[22px] items-center justify-center overflow-hidden rounded-full"
              style={{ background: stratusGradient }}
            >
              <span className="size-2 rounded-full bg-white/80" />
            </div>
            <div>
              <p className="text-[15px] font-medium text-ish-ink">Stratus</p>
              <p className="text-[12px] text-ish-ink-soft">Blue · Salmon · Yellow</p>
            </div>
          </div>
          <div
            className={cn(
              "flex size-6 items-center justify-center rounded-full border-2",
              resolvedTheme === "stratus" ? "border-ish-black bg-ish-black text-white" : "border-ish-border",
            )}
          >
            {resolvedTheme === "stratus" ? <Check className="size-3.5" strokeWidth={3} /> : null}
          </div>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="Stratus Palette">
        <div className="divide-y divide-ish-border/70">
          {stratusPaletteLegend.map((swatch) => (
            <div key={swatch.hex} className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <span
                  className="size-5 rounded-full border border-ish-border/50"
                  style={{ backgroundColor: swatch.hex }}
                />
                <span className="text-[15px] font-medium text-ish-ink">{swatch.label}</span>
              </div>
              <span className="font-mono text-[12px] text-ish-ink-faint">{swatch.hex.toUpperCase()}</span>
            </div>
          ))}
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="size-5 rounded-full border border-ish-border/50" style={{ backgroundColor: stratusPalette.black }} />
              <span className="text-[15px] font-medium text-ish-ink">Button</span>
            </div>
            <span className="font-mono text-[12px] text-ish-ink-faint">{stratusPalette.black.toUpperCase()}</span>
          </div>
        </div>
      </SettingsGroup>
    </>
  );
}

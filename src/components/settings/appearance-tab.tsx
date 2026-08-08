"use client";

import { Check } from "lucide-react";
import { SettingsGroup, SettingsGroupDivider, SettingsRow } from "@/components/settings/settings-group";
import { stratusPalette, stratusGradient, stratusPaletteLegend } from "@/design-system";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/providers/theme-provider";

function ThemePreview({ variant }: { variant: "light" | "stratus" }) {
  const isStratus = variant === "stratus";
  return (
    <div
      className={cn(
        "mt-3 overflow-hidden rounded-xl border shadow-[var(--shadow-brand-sm)]",
        isStratus ? "border-brand-stratus-blue/30 bg-[#eef4fd]" : "border-brand-border bg-[#f4f4f6]",
      )}
    >
      <div className={cn("flex items-center gap-2 border-b px-3 py-2", isStratus ? "border-brand-stratus-blue/20 bg-white/70" : "border-brand-border bg-white")}>
        <span className={cn("size-2 rounded-full", isStratus ? "bg-brand-stratus-blue" : "bg-brand-ink-faint")} />
        <span className={cn("size-2 rounded-full", isStratus ? "bg-brand-stratus-salmon" : "bg-brand-yellow")} />
        <span className={cn("size-2 rounded-full", isStratus ? "bg-brand-stratus-yellow" : "bg-brand-green")} />
      </div>
      <div className="flex gap-2 p-3">
        <div className={cn("h-16 w-14 shrink-0 rounded-lg", isStratus ? "bg-white/80 shadow-[var(--shadow-brand-sm)]" : "bg-white border border-brand-border")} />
        <div className="flex flex-1 flex-col gap-1.5">
          <div className={cn("h-3 w-3/4 rounded-md", isStratus ? "bg-brand-stratus-blue/30" : "bg-brand-border")} />
          <div className={cn("h-8 rounded-lg", isStratus ? "bg-brand-yellow/60" : "bg-brand-yellow-soft")} />
          <div className={cn("h-6 rounded-lg", isStratus ? "bg-white/80" : "bg-white border border-brand-border")} />
        </div>
      </div>
    </div>
  );
}

function ThemeSwatch({ colors }: { colors: string[] }) {
  return (
    <div className="flex gap-1.5">
      {colors.map((c) => (
        <span key={c} className="size-4 rounded-full border border-black/5 shadow-[var(--shadow-brand-sm)]" style={{ backgroundColor: c }} />
      ))}
    </div>
  );
}

export function AppearanceTab() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <>
      <SettingsGroup title="Theme" footer="Your preference is saved in the browser and applies instantly.">
        <SettingsRow onClick={() => setTheme("light")} className="flex-col items-stretch !py-4">
          <div className="flex w-full items-center justify-between">
            <div className="flex items-center gap-3">
              <ThemeSwatch colors={["#1a1a1f", "#ffce87", "#3fbe82"]} />
              <div>
                <p className="text-[15px] font-medium text-brand-ink">Light</p>
                <p className="text-[12px] text-brand-ink-soft">Clean white canvas</p>
              </div>
            </div>
            <div
              className={cn(
                "flex size-6 items-center justify-center rounded-full border-2 transition-all",
                resolvedTheme === "light" ? "border-brand-black bg-brand-black text-white shadow-[var(--shadow-brand-sm)]" : "border-brand-border",
              )}
            >
              {resolvedTheme === "light" ? <Check className="size-3.5" strokeWidth={3} /> : null}
            </div>
          </div>
          <ThemePreview variant="light" />
        </SettingsRow>

        <SettingsGroupDivider />

        <SettingsRow onClick={() => setTheme("stratus")} className="flex-col items-stretch !py-4">
          <div className="flex w-full items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="flex size-[22px] items-center justify-center overflow-hidden rounded-full shadow-[var(--shadow-brand-sm)]"
                style={{ background: stratusGradient }}
              >
                <span className="size-2 rounded-full bg-white/80" />
              </div>
              <div>
                <p className="text-[15px] font-medium text-brand-ink">Stratus</p>
                <p className="text-[12px] text-brand-ink-soft">Blue · Salmon · Yellow · Frosted glass</p>
              </div>
            </div>
            <div
              className={cn(
                "flex size-6 items-center justify-center rounded-full border-2 transition-all",
                resolvedTheme === "stratus" ? "border-brand-black bg-brand-black text-white shadow-[var(--shadow-brand-sm)]" : "border-brand-border",
              )}
            >
              {resolvedTheme === "stratus" ? <Check className="size-3.5" strokeWidth={3} /> : null}
            </div>
          </div>
          <ThemePreview variant="stratus" />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="Stratus Palette">
        <div className="divide-y divide-brand-border/60">
          {stratusPaletteLegend.map((swatch) => (
            <div key={swatch.hex} className="flex items-center justify-between px-4 py-3 transition-colors hover:bg-black/[0.02]">
              <div className="flex items-center gap-3">
                <span
                  className="size-6 rounded-full border border-brand-border/50 shadow-[var(--shadow-brand-sm)]"
                  style={{ backgroundColor: swatch.hex }}
                />
                <span className="text-[15px] font-medium text-brand-ink">{swatch.label}</span>
              </div>
              <span className="font-mono text-[12px] text-brand-ink-faint">{swatch.hex.toUpperCase()}</span>
            </div>
          ))}
          <div className="flex items-center justify-between px-4 py-3 transition-colors hover:bg-black/[0.02]">
            <div className="flex items-center gap-3">
              <span className="size-6 rounded-full border border-brand-border/50 shadow-[var(--shadow-brand-sm)]" style={{ backgroundColor: stratusPalette.black }} />
              <span className="text-[15px] font-medium text-brand-ink">Button</span>
            </div>
            <span className="font-mono text-[12px] text-brand-ink-faint">{stratusPalette.black.toUpperCase()}</span>
          </div>
          <div className="px-4 py-4">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-brand-ink-faint">Gradient bar</p>
            <div className="h-3 overflow-hidden rounded-full shadow-[var(--shadow-brand-sm)]" style={{ background: stratusGradient }} />
          </div>
        </div>
      </SettingsGroup>
    </>
  );
}

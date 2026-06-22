"use client";

import { SettingsSection } from "@/components/settings/settings-section";
import { stratusPalette, stratusGradient, stratusPaletteLegend } from "@/design-system";
import { cn } from "@/lib/utils";
import { useTheme } from "next-themes";

export function AppearanceTab() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <div className="grid grid-cols-12 gap-4">
      <SettingsSection
        className="col-span-12"
        title="Theme"
        description="Choose how the app looks. Your preference is saved in the browser."
        tone="yellow"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setTheme("light")}
            className={cn(
              "group relative flex flex-col gap-3 rounded-[18px] border-2 p-4 text-left transition-all",
              resolvedTheme === "light"
                ? "border-ish-black bg-white shadow-ish"
                : "border-ish-border bg-white hover:border-ish-ink-faint",
            )}
          >
            <div className="flex h-16 w-full items-center justify-center rounded-[12px] bg-[#f4f4f6]">
              <div className="flex gap-1.5">
                <span className="size-3 rounded-full bg-[#1a1a1f]" />
                <span className="size-3 rounded-full bg-ish-yellow" />
                <span className="size-3 rounded-full bg-ish-stratus-blue" />
              </div>
            </div>
            <div>
              <p className="text-[13px] font-bold text-ish-ink">Light</p>
              <p className="mt-0.5 text-[11px] text-ish-ink-faint">Clean white canvas</p>
            </div>
            {resolvedTheme === "light" && (
              <span className="absolute right-3 top-3 flex size-5 items-center justify-center rounded-full bg-ish-black text-[10px] font-bold text-white">
                ✓
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setTheme("stratus")}
            className={cn(
              "group relative flex flex-col gap-3 rounded-[18px] border-2 p-4 text-left transition-all",
              resolvedTheme === "stratus" && "shadow-[0_4px_20px_rgba(131,162,219,0.14)]",
            )}
            style={{
              borderColor: resolvedTheme === "stratus" ? stratusPalette.blue : stratusPalette.borderLight,
              backgroundColor: stratusPalette.canvasPreview,
            }}
          >
            <div
              className="flex h-16 w-full items-center justify-center overflow-hidden rounded-[12px]"
              style={{ background: stratusGradient }}
            >
              <div className="flex gap-1.5">
                <span className="size-3 rounded-full bg-white/80" />
                <span className="size-3 rounded-full bg-white/60" />
                <span className="size-3 rounded-full bg-white/40" />
              </div>
            </div>
            <div>
              <p className="text-[13px] font-bold text-ish-ink">Stratus</p>
              <p className="mt-0.5 text-[11px] text-ish-ink-faint">Blue · Salmon · Yellow</p>
            </div>
            {resolvedTheme === "stratus" && (
              <span
                className="absolute right-3 top-3 flex size-5 items-center justify-center rounded-full text-[10px] font-bold text-white"
                style={{ backgroundColor: stratusPalette.blue }}
              >
                ✓
              </span>
            )}
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-[14px] border border-ish-border bg-ish-app/70 px-4 py-3 backdrop-blur-sm">
          {stratusPaletteLegend.map((swatch, i) => (
            <span key={swatch.hex} className="contents">
              {i > 0 && <span className="text-ish-border">·</span>}
              <div className="flex items-center gap-2">
                <span
                  className="size-3 rounded-full border border-ish-border/60"
                  style={{ backgroundColor: swatch.hex }}
                />
                <span className="text-[11px] text-ish-ink-soft">
                  {swatch.hex.toUpperCase()} {swatch.label}
                </span>
              </div>
            </span>
          ))}
        </div>
      </SettingsSection>
    </div>
  );
}

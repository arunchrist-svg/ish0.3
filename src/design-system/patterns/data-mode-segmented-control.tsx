"use client";

import { Database } from "lucide-react";
import { cn } from "@/lib/utils";
import { DATA_MODE_OPTIONS } from "@/lib/enrichment/config";
import type { DataMode } from "@/lib/enrichment/types";
import { SlidingHighlight } from "../primitives/sliding-highlight";
import { useSlidingHighlight } from "../hooks/use-sliding-highlight";

type DataModeSegmentedControlProps = {
  value: DataMode;
  onChange: (mode: DataMode) => void;
  className?: string;
};

export function DataModeSegmentedControl({ value, onChange, className }: DataModeSegmentedControlProps) {
  const { containerRef, register, rect, ready } = useSlidingHighlight(value);

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative inline-flex items-center gap-1 rounded-xl border border-ish-border/70 bg-white/60 p-1 shadow-[var(--shadow-ish-sm)] backdrop-blur-sm",
        className,
      )}
    >
      <SlidingHighlight
        rect={rect}
        ready={ready}
        className="rounded-lg bg-ish-black shadow-[var(--shadow-ish-sm)]"
      />
      <Database
        className={cn(
          "relative z-10 ml-1.5 size-3.5 shrink-0 transition-colors duration-300",
          "text-ish-ink-soft",
        )}
        aria-hidden
      />
      {DATA_MODE_OPTIONS.map((mode) => {
        const active = value === mode.value;
        return (
          <button
            key={mode.value}
            ref={register(mode.value)}
            type="button"
            title={mode.title}
            onClick={() => onChange(mode.value)}
            className={cn(
              "relative z-10 rounded-lg px-3 py-1.5 text-[11px] font-semibold",
              "transition-[color,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
              "active:scale-[0.97]",
              active ? "text-white" : "text-ish-ink-soft hover:text-ish-ink",
            )}
          >
            {mode.label}
          </button>
        );
      })}
    </div>
  );
}

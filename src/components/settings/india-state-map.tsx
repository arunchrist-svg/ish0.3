"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { INDIA_STATES } from "@/lib/geo/india";
import { INDIA_MAP_VIEWBOX, INDIA_STATE_PATHS } from "@/lib/geo/india-state-paths";

type Props = {
  selectedIds: string[];
  disabled?: boolean;
  onToggle: (stateId: string) => void;
};

export function IndiaStateMap({ selectedIds, disabled, onToggle }: Props) {
  const selected = new Set(selectedIds);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const hovered = INDIA_STATE_PATHS.find((s) => s.id === hoveredId);
  const selectedNames = useMemo(
    () => INDIA_STATES.filter((s) => selectedIds.includes(s.id)).map((s) => s.name),
    [selectedIds],
  );

  return (
    <div className="overflow-hidden rounded-2xl border border-brand-border bg-gradient-to-b from-sky-50/80 to-white">
      <div className="relative px-2 pt-2 sm:px-3 sm:pt-3">
        <svg
          viewBox={INDIA_MAP_VIEWBOX}
          role="group"
          aria-label="India states. Click to multi-select."
          className={cn("mx-auto block h-auto w-full max-h-[420px]", disabled && "pointer-events-none opacity-40")}
        >
          {INDIA_STATE_PATHS.map((state) => {
            const isOn = selected.has(state.id);
            const isHover = hoveredId === state.id;
            return (
              <path
                key={state.id}
                d={state.d}
                role="button"
                tabIndex={disabled ? -1 : 0}
                aria-pressed={isOn}
                aria-label={state.name}
                onClick={() => onToggle(state.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onToggle(state.id);
                  }
                }}
                onMouseEnter={() => setHoveredId(state.id)}
                onMouseLeave={() => setHoveredId((id) => (id === state.id ? null : id))}
                onFocus={() => setHoveredId(state.id)}
                onBlur={() => setHoveredId((id) => (id === state.id ? null : id))}
                className={cn(
                  "cursor-pointer stroke-[1.1] transition-[fill,stroke] duration-150 outline-none",
                  isOn
                    ? "fill-brand-black stroke-brand-black"
                    : isHover
                      ? "fill-brand-stratus-blue/35 stroke-brand-stratus-blue"
                      : "fill-white stroke-brand-border hover:fill-brand-stratus-blue/20",
                )}
              />
            );
          })}
        </svg>
        <p className="pointer-events-none absolute bottom-2 left-1/2 min-h-5 w-[min(92%,280px)] -translate-x-1/2 truncate rounded-full bg-white/90 px-3 py-1 text-center text-[11px] font-medium text-brand-ink shadow-sm ring-1 ring-brand-border/70">
          {hovered?.name ?? "Tap states to multi-select"}
        </p>
      </div>
      {selectedNames.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 border-t border-brand-border/70 px-3 py-2">
          {selectedNames.map((name) => (
            <span
              key={name}
              className="rounded-full bg-brand-black px-2 py-0.5 text-[10.5px] font-semibold text-white"
            >
              {name}
            </span>
          ))}
        </div>
      ) : (
        <p className="border-t border-brand-border/70 px-3 py-2 text-center text-[11px] text-brand-ink-faint">
          Outlines from India Maps data. Selected states fill dark.
        </p>
      )}
    </div>
  );
}

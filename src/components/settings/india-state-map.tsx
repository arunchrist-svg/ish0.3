"use client";

import { cn } from "@/lib/utils";
import { INDIA_STATES } from "@/lib/geo/india";

/** Tile cartogram: states sit in approximate geographic order for multi-select. */
const MAP_ROWS: string[][] = [
  ["", "", "JK", "LA", "", "", "AR"],
  ["", "HP", "PB", "CH", "UK", "", "NL"],
  ["", "", "HR", "DL", "", "AS", "MN"],
  ["", "RJ", "", "UP", "BR", "SK", "ML"],
  ["GJ", "", "MP", "", "JH", "WB", "TR"],
  ["DD", "MH", "", "CG", "", "OD", "MZ"],
  ["", "GA", "TS", "", "AP", "", ""],
  ["", "KA", "", "", "", "", ""],
  ["LD", "KL", "TN", "PY", "", "AN", ""],
];

const STATE_BY_ID = new Map(INDIA_STATES.map((s) => [s.id, s]));

type Props = {
  selectedIds: string[];
  disabled?: boolean;
  onToggle: (stateId: string) => void;
};

export function IndiaStateMap({ selectedIds, disabled, onToggle }: Props) {
  const selected = new Set(selectedIds);

  return (
    <div className="overflow-x-auto rounded-2xl border border-brand-border bg-gradient-to-b from-sky-50/80 to-white p-3">
      <div className="mx-auto grid w-max grid-cols-7 gap-1.5">
        {MAP_ROWS.flatMap((row, rowIdx) =>
          row.map((id, colIdx) => {
            if (!id) {
              return <div key={`e-${rowIdx}-${colIdx}`} className="size-[44px] sm:h-10 sm:w-[52px]" />;
            }
            const state = STATE_BY_ID.get(id);
            const isOn = selected.has(id);
            return (
              <button
                key={id}
                type="button"
                disabled={disabled}
                title={state?.name ?? id}
                onClick={() => onToggle(id)}
                className={cn(
                  "flex h-10 w-[52px] flex-col items-center justify-center rounded-lg border text-center transition-colors",
                  "disabled:cursor-not-allowed disabled:opacity-40",
                  isOn
                    ? "border-brand-black bg-brand-black text-white shadow-sm"
                    : "border-brand-border/80 bg-white/90 text-brand-ink hover:border-brand-black/40",
                )}
              >
                <span className="text-[11px] font-bold leading-none">{id}</span>
                <span className="mt-0.5 max-w-full truncate px-0.5 text-[8px] leading-tight opacity-80">
                  {(state?.name ?? id).split(" ")[0]}
                </span>
              </button>
            );
          }),
        )}
      </div>
      <p className="mt-2 text-center text-[11px] text-brand-ink-faint">
        Tap states to multi-select. Codes match official abbreviations.
      </p>
    </div>
  );
}

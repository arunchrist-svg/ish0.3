import { cn } from "@/lib/utils";
import { Minus, Plus } from "lucide-react";
import { SettingsRow } from "@/components/settings/settings-group";

export function SettingsNumberRow({
  label,
  desc,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  desc?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  function bump(delta: number) {
    onChange(Math.min(max, Math.max(min, value + delta)));
  }

  return (
    <SettingsRow className="justify-between">
      <div className="min-w-0 flex-1 pr-4">
        <div className="text-[15px] font-medium leading-snug text-ish-ink">{label}</div>
        {desc ? <p className="mt-0.5 text-[12px] leading-relaxed text-ish-ink-soft">{desc}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-1 rounded-xl bg-ish-canvas/80 p-0.5">
        <button
          type="button"
          onClick={() => bump(-step)}
          disabled={value <= min}
          className="flex size-8 items-center justify-center rounded-[10px] text-ish-ink-soft transition-colors hover:bg-white disabled:opacity-30"
          aria-label={`Decrease ${label}`}
        >
          <Minus className="size-3.5" />
        </button>
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => {
            const next = parseInt(e.target.value, 10);
            if (Number.isFinite(next)) onChange(Math.min(max, Math.max(min, next)));
          }}
          className={cn(
            "w-11 bg-transparent text-center text-[15px] font-semibold tabular-nums text-ish-ink",
            "focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
          )}
        />
        <button
          type="button"
          onClick={() => bump(step)}
          disabled={value >= max}
          className="flex size-8 items-center justify-center rounded-[10px] text-ish-ink-soft transition-colors hover:bg-white disabled:opacity-30"
          aria-label={`Increase ${label}`}
        >
          <Plus className="size-3.5" />
        </button>
      </div>
    </SettingsRow>
  );
}

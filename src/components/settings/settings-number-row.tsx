import { cn } from "@/lib/utils";

export function SettingsNumberRow({
  label,
  desc,
  value,
  min,
  max,
  step = 1,
  suffix,
  onChange,
}: {
  label: string;
  desc: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-[16px] border border-ish-border bg-white p-4">
      <div>
        <div className="text-[13.5px] font-bold text-ish-ink">{label}</div>
        <p className="mt-0.5 text-[12px] text-ish-ink-soft">{desc}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
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
            "w-20 rounded-[12px] border border-ish-border bg-ish-app px-3 py-2 text-right text-[13px] font-semibold text-ish-ink",
            "focus:border-ish-black focus:outline-none",
          )}
        />
        {suffix ? <span className="text-[12px] text-ish-ink-soft">{suffix}</span> : null}
      </div>
    </div>
  );
}

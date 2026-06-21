import { cn } from "@/lib/utils";

export function SettingsToggleRow({
  label,
  desc,
  value,
  onChange,
}: {
  label: string;
  desc: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-[16px] border border-ish-border bg-white p-4">
      <div>
        <div className="text-[13.5px] font-bold text-ish-ink">{label}</div>
        <p className="mt-0.5 text-[12px] text-ish-ink-soft">{desc}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className={cn(
          "relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors duration-200",
          value ? "bg-ish-black" : "bg-ish-border",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform duration-200",
            value ? "translate-x-5" : "translate-x-0.5",
          )}
        />
      </button>
    </div>
  );
}

import { cn } from "@/lib/utils";
import { SettingsRow } from "@/components/settings/settings-group";

export function SettingsToggleRow({
  label,
  desc,
  value,
  onChange,
}: {
  label: string;
  desc?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <SettingsRow className="justify-between">
      <div className="min-w-0 flex-1 pr-4">
        <div className="text-[15px] font-medium leading-snug text-ish-ink">{label}</div>
        {desc ? <p className="mt-0.5 text-[12px] leading-relaxed text-ish-ink-soft">{desc}</p> : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className={cn(
          "relative h-[31px] w-[51px] shrink-0 overflow-hidden rounded-full transition-colors duration-200",
          value ? "bg-ish-black" : "bg-ish-border",
        )}
      >
        <span
          className={cn(
            "absolute top-[2px] size-[27px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.2)] transition-[left] duration-200 ease-out",
            value ? "left-[22px]" : "left-[2px]",
          )}
        />
      </button>
    </SettingsRow>
  );
}

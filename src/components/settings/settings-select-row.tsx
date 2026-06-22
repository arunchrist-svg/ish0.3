import { cn } from "@/lib/utils";
import { SettingsGroupDivider, SettingsRow } from "@/components/settings/settings-group";
import { SettingsSelectedIndicator } from "@/components/settings/settings-selected-indicator";

type SettingsSelectRowProps = {
  label: string;
  desc?: string;
  badge?: string;
  selected: boolean;
  onSelect: () => void;
  showDivider?: boolean;
};

const BADGE_COLORS: Record<string, string> = {
  Free: "text-ish-stratus-blue",
  "Free tier": "text-ish-stratus-blue",
  Paid: "text-ish-ink-soft",
};

export function SettingsSelectRow({
  label,
  desc,
  badge,
  selected,
  onSelect,
  showDivider,
}: SettingsSelectRowProps) {
  return (
    <>
      {showDivider ? <SettingsGroupDivider /> : null}
      <SettingsRow onClick={onSelect} className="justify-between">
        <div className="min-w-0 flex-1 pr-3">
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-medium text-ish-ink">{label}</span>
            {badge ? (
              <span className={cn("text-[11px] font-semibold", BADGE_COLORS[badge] ?? "text-ish-ink-faint")}>
                {badge}
              </span>
            ) : null}
          </div>
          {desc ? <p className="mt-0.5 text-[12px] leading-relaxed text-ish-ink-soft">{desc}</p> : null}
        </div>
        <SettingsSelectedIndicator selected={selected} />
      </SettingsRow>
    </>
  );
}

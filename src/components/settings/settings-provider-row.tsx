import { SettingsSelectRow } from "@/components/settings/settings-select-row";

export function SettingsProviderRow<T extends string>({
  value,
  selected,
  label,
  desc,
  badge,
  onSelect,
  showDivider,
}: {
  value: T;
  selected: boolean;
  label: string;
  desc: string;
  badge: string;
  onSelect: (v: T) => void;
  showDivider?: boolean;
}) {
  return (
    <SettingsSelectRow
      label={label}
      desc={desc}
      badge={badge}
      selected={selected}
      onSelect={() => onSelect(value)}
      showDivider={showDivider}
    />
  );
}

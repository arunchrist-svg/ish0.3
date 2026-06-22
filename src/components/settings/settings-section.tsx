import { SettingsGroup } from "@/components/settings/settings-group";
import { cn } from "@/lib/utils";

type SettingsSectionProps = {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  tone?: "white" | "yellow" | "pink" | "green";
};

/** @deprecated Prefer SettingsGroup directly. Thin wrapper for backward compatibility. */
export function SettingsSection({
  title,
  description,
  children,
  className,
  contentClassName,
}: SettingsSectionProps) {
  return (
    <SettingsGroup title={title} footer={description} className={className}>
      <div className={cn(contentClassName)}>{children}</div>
    </SettingsGroup>
  );
}

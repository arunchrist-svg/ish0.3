import { PanelCard, SectionHeader, text } from "@/design-system";
import { cn } from "@/lib/utils";

type SettingsSectionProps = {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
};

export function SettingsSection({
  title,
  description,
  children,
  className,
  contentClassName,
}: SettingsSectionProps) {
  return (
    <PanelCard
      tone="white"
      className={cn("mb-6 rounded-[24px] p-6 shadow-[var(--shadow-ish-sm)]", className)}
    >
      <SectionHeader title={title} size="card" className="mb-1" />
      {description ? <p className={cn("mb-4", text.caption)}>{description}</p> : null}
      <div className={contentClassName}>{children}</div>
    </PanelCard>
  );
}

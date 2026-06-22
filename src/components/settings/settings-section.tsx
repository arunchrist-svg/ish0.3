import { PanelCard, SectionHeader, text } from "@/design-system";
import { cn } from "@/lib/utils";

type SettingsSectionProps = {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  tone?: "white" | "yellow" | "pink" | "green";
};

export function SettingsSection({
  title,
  description,
  children,
  className,
  contentClassName,
  tone = "white",
}: SettingsSectionProps) {
  return (
    <PanelCard
      tone={tone}
      className={cn(
        "rounded-[20px] border border-ish-border/60 p-5 shadow-[var(--shadow-ish-sm)] backdrop-blur-sm",
        className,
      )}
    >
      <SectionHeader title={title} size="card" className="mb-1" />
      {description ? <p className={cn("mb-4", text.caption)}>{description}</p> : null}
      <div className={contentClassName}>{children}</div>
    </PanelCard>
  );
}

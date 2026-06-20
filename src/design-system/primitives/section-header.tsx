import { cn } from "@/lib/utils";
import { text } from "@/design-system/tokens";

type SectionHeaderProps = {
  title: string;
  actions?: React.ReactNode;
  className?: string;
  size?: "default" | "card";
};

export function SectionHeader({ title, actions, className, size = "default" }: SectionHeaderProps) {
  return (
    <div className={cn("flex items-center justify-between", className)}>
      <div className={size === "card" ? text.cardTitle : text.sectionTitle}>{title}</div>
      {actions}
    </div>
  );
}

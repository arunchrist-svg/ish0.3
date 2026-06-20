import { cn } from "@/lib/utils";
import { text } from "@/design-system/tokens";
import { NavItem } from "./nav-item";

type NavSectionProps = {
  title?: string;
  items: { icon: React.ElementType; label: string; active?: boolean }[];
};

export function NavSection({ title, items }: NavSectionProps) {
  return (
    <>
      {title && <div className={cn("mb-1.5 mt-4 px-2", text.navSection)}>{title}</div>}
      {items.map(({ icon, label, active }) => (
        <NavItem key={label} icon={icon} label={label} active={active} />
      ))}
    </>
  );
}

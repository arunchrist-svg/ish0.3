import { cn } from "@/lib/utils";
import { text } from "@/design-system/tokens";

type NavItemProps = {
  icon: React.ElementType;
  label: string;
  active?: boolean;
};

export function NavItem({ icon: Icon, label, active }: NavItemProps) {
  return (
    <div
      className={cn(
        "mb-0.5 flex items-center gap-3 rounded-[10px] px-2 py-2",
        active ? "bg-ish-yellow" : "",
        active ? text.navItemActive : text.navItem,
      )}
    >
      <Icon className="size-4 shrink-0" />
      {label}
    </div>
  );
}

import { Bell, ChevronDown, Grip, HelpCircle, Lightbulb, Plus, Search, Settings } from "lucide-react";
import { CircleButton, IshAvatar, ThemeToggle } from "@/design-system";

export function TopBar() {
  return (
    <div className="flex items-center border-b border-ish-border bg-white px-7 py-4">
      <div className="flex items-center gap-2.5">
        <Grip className="size-4 text-ish-ink-faint" />
        <span className="text-xl">🪔</span>
        <span className="text-[15px] font-bold text-ish-ink">India Sweet House</span>
        <span className="font-light text-ish-border">|</span>
        <span className="text-sm text-ish-ink-soft">Sales Hub</span>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <CircleButton size={36}><Search className="size-4" /></CircleButton>
        <CircleButton size={36}><Plus className="size-4" /></CircleButton>
        <CircleButton size={36}><Lightbulb className="size-4" /></CircleButton>
        <CircleButton size={36}><ChevronDown className="size-4" /></CircleButton>
        <ThemeToggle />
        <CircleButton size={36}><Settings className="size-4" /></CircleButton>
        <CircleButton size={36}><HelpCircle className="size-4" /></CircleButton>
        <CircleButton size={36}><Bell className="size-4" /></CircleButton>
        <IshAvatar name="ISH Owner" index={3} size={36} />
      </div>
    </div>
  );
}

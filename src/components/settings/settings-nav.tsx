"use client";

import { cn } from "@/lib/utils";
import { SlidingHighlight } from "@/design-system/primitives/sliding-highlight";
import { useSlidingHighlight } from "@/design-system/hooks/use-sliding-highlight";
import { text } from "@/design-system/tokens";

export type SettingsNavItem = {
  value: string;
  label: string;
  icon: React.ElementType;
};

type SettingsNavProps = {
  value: string;
  onChange: (value: string) => void;
  items: SettingsNavItem[];
};

export function SettingsNav({ value, onChange, items }: SettingsNavProps) {
  const { containerRef, register, rect, ready } = useSlidingHighlight(value);

  return (
    <aside className="settings-nav-rail ish-glass-sidebar relative hidden h-full w-[200px] shrink-0 flex-col lg:flex">
      <div
        className="settings-nav-divider pointer-events-none absolute bottom-0 right-0 top-[3px] z-20 w-px"
        aria-hidden
      />
      <div className="ish-settings-header relative z-20 flex shrink-0 items-center bg-transparent px-5">
        <span className="text-[20px] font-extrabold tracking-tight text-brand-ink">Settings</span>
      </div>
      <nav ref={containerRef} className="relative flex flex-1 flex-col overflow-y-auto px-3 py-3">
        <SlidingHighlight rect={rect} ready={ready} />
        {items.map((item) => {
          const Icon = item.icon;
          const active = value === item.value;
          return (
            <button
              key={item.value}
              ref={register(item.value)}
              type="button"
              onClick={() => onChange(item.value)}
              className={cn(
                "relative z-10 mb-0.5 flex items-center gap-3 rounded-[10px] px-2 py-2",
                "transition-[color,transform] duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
                "hover:translate-x-0.5 active:scale-[0.98]",
                !active && "hover:bg-black/[0.04]",
                active ? text.navItemActive : text.navItem,
              )}
            >
              <Icon
                className={cn(
                  "size-4 shrink-0 transition-[transform,color] duration-[420ms]",
                  active ? "scale-110 text-brand-ink" : "text-brand-ink-soft",
                )}
              />
              <span className={cn("text-[13.5px]", active ? "font-semibold" : "font-medium")}>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

"use client";

import { cn } from "@/lib/utils";

type ScrollableTabsProps = {
  tabs: string[];
  value: string;
  onChange: (value: string) => void;
  badges?: Record<string, boolean>;
  className?: string;
};

export function ScrollableTabs({ tabs, value, onChange, badges, className }: ScrollableTabsProps) {
  return (
    <div className={cn("ish-scroll-tabs -mx-1 overflow-x-auto px-1 pb-1", className)}>
      <div className="flex min-w-max gap-1.5">
        {tabs.map((tab) => {
          const active = tab === value;
          return (
            <button
              key={tab}
              type="button"
              onClick={() => onChange(tab)}
              className={cn(
                "relative flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-[14px] px-4 py-2 text-[13px] font-semibold transition-all active:scale-[0.97]",
                active ? "bg-ish-black text-white" : "bg-ish-canvas text-ish-ink-soft",
              )}
            >
              {tab}
              {badges?.[tab] ? (
                <span className="size-1.5 rounded-full bg-[#e8a000]" aria-label="Action needed" />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

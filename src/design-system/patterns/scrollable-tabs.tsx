"use client";

import { cn } from "@/lib/utils";
import { hapticLight } from "@/lib/capacitor/platform";

type ScrollableTabsProps = {
  tabs: string[];
  value: string;
  onChange: (value: string) => void;
  badges?: Record<string, boolean>;
  counts?: Record<string, number>;
  compact?: boolean;
  className?: string;
};

export function ScrollableTabs({
  tabs,
  value,
  onChange,
  badges,
  counts,
  compact = false,
  className,
}: ScrollableTabsProps) {
  return (
    <div
      className={cn(
        "ish-scroll-tabs -mx-1 overflow-x-auto px-1",
        compact ? "pb-0.5" : "pb-1",
        className,
      )}
    >
      <div className={cn("flex min-w-max", compact ? "gap-1.5" : "gap-2")}>
        {tabs.map((tab) => {
          const active = tab === value;
          const count = counts?.[tab];
          const showCount = count !== undefined;
          return (
            <button
              key={tab}
              type="button"
              onClick={() => {
                void hapticLight();
                onChange(tab);
              }}
              className={cn(
                "ish-touch-target relative flex shrink-0 items-center font-semibold transition-all",
                compact
                  ? "min-h-[36px] gap-1 rounded-xl px-3 py-1.5 text-[13px]"
                  : "min-h-[44px] gap-1.5 rounded-2xl px-4 py-2 text-[14px]",
                active
                  ? "bg-ish-stratus-blue text-white shadow-ish-sm"
                  : "bg-white text-ish-ink-soft shadow-ish-sm",
              )}
            >
              {tab}
              {showCount ? (
                <span
                  className={cn(
                    "tabular-nums",
                    active ? "text-white/85" : "text-ish-ink-soft/70",
                  )}
                >
                  ({count})
                </span>
              ) : null}
              {!showCount && badges?.[tab] ? (
                <span className="size-2 rounded-full bg-ish-stratus-yellow" aria-label="Action needed" />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

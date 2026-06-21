"use client";

import { cn } from "@/lib/utils";
import { SlidingHighlight } from "../primitives/sliding-highlight";
import { useSlidingHighlight } from "../hooks/use-sliding-highlight";

type SegmentedTab = {
  value: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
};

type SegmentedTabsProps = {
  value: string;
  onChange: (value: string) => void;
  items: SegmentedTab[];
  className?: string;
};

export function SegmentedTabs({ value, onChange, items, className }: SegmentedTabsProps) {
  const { containerRef, register, rect, ready } = useSlidingHighlight(value);

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative inline-flex items-center gap-1 rounded-xl border border-ish-border bg-ish-app p-1",
        className,
      )}
    >
      <SlidingHighlight rect={rect} ready={ready} className="rounded-lg bg-white shadow-[var(--shadow-ish-sm)]" />

      {items.map((item) => {
        const active = value === item.value;
        return (
          <button
            key={item.value}
            ref={register(item.value)}
            type="button"
            onClick={() => onChange(item.value)}
            className={cn(
              "relative z-10 inline-flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-[12px] font-semibold",
              "transition-[color,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
              "hover:text-ish-ink active:scale-[0.97]",
              active ? "text-ish-ink" : "text-ish-ink-soft",
            )}
          >
            {item.icon}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

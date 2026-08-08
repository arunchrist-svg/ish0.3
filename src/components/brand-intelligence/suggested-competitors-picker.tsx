"use client";

import { cn } from "@/lib/utils";

type Props = {
  suggestions: string[];
  selected: string[];
  onToggle: (brand: string) => void;
  className?: string;
};

function isSelected(selected: string[], brand: string): boolean {
  const normalized = brand.toLowerCase();
  return selected.some((item) => item.toLowerCase() === normalized);
}

export function SuggestedCompetitorsPicker({ suggestions, selected, onToggle, className }: Props) {
  if (!suggestions.length) return null;

  return (
    <div className={cn("space-y-2", className)}>
      <p className="text-[11.5px] text-brand-ink-soft">
        Suggested competitors for this category. Click to add or remove.
      </p>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((brand) => {
          const active = isSelected(selected, brand);
          return (
            <button
              key={brand}
              type="button"
              onClick={() => onToggle(brand)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-[12px] font-medium transition",
                active
                  ? "border-brand-black bg-brand-black text-white"
                  : "border-brand-border bg-white text-brand-ink hover:border-brand-black/30",
              )}
            >
              {brand}
            </button>
          );
        })}
      </div>
    </div>
  );
}

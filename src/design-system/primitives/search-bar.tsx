"use client";

import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

type SearchBarProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  sticky?: boolean;
};

export function SearchBar({
  value,
  onChange,
  placeholder = "Search",
  className,
  sticky = false,
}: SearchBarProps) {
  return (
    <div
      className={cn(
        "ish-page-padding py-2",
        sticky && "sticky top-0 z-20 bg-ish-canvas/95 backdrop-blur-md lg:bg-transparent",
        className,
      )}
    >
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-ish-ink-faint" />
        <input
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={cn(
            "h-11 w-full rounded-xl border border-ish-border/80 bg-white pl-10 pr-10 text-[16px] text-ish-ink",
            "placeholder:text-ish-ink-faint focus:border-ish-stratus-blue focus:outline-none focus:ring-2 focus:ring-ish-stratus-blue/15",
          )}
        />
        {value ? (
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute right-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-ish-ink-soft active:scale-95"
            aria-label="Clear search"
          >
            <X className="size-4" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

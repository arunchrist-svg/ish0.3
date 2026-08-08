"use client";

import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  getIndustryByLabel,
  searchIndustries,
  type IndustryCatalogEntry,
} from "@/lib/brand-intel/industry-catalog";

type Props = {
  value: string;
  onChange: (value: string) => void;
  onIndustrySelect?: (entry: IndustryCatalogEntry | null) => void;
  placeholder?: string;
  className?: string;
};

export function ProductCategoryPicker({
  value,
  onChange,
  onIndustrySelect,
  placeholder = "Start typing, e.g. kit",
  className,
}: Props) {
  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [suggestions, setSuggestions] = useState<IndustryCatalogEntry[]>([]);

  useEffect(() => {
    if (!open) return;
    setSuggestions(searchIndustries(value));
    setActiveIndex(0);
  }, [value, open]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  function selectEntry(entry: IndustryCatalogEntry) {
    onChange(entry.label);
    onIndustrySelect?.(entry);
    setOpen(false);
  }

  function handleBlur() {
    window.setTimeout(() => {
      if (!containerRef.current?.contains(document.activeElement)) {
        setOpen(false);
        onIndustrySelect?.(getIndustryByLabel(value));
      }
    }, 0);
  }

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          onIndustrySelect?.(null);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={handleBlur}
        onKeyDown={(e) => {
          if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            setOpen(true);
            return;
          }
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIndex((i) => Math.min(i + 1, Math.max(suggestions.length - 1, 0)));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIndex((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter" && open && suggestions[activeIndex]) {
            e.preventDefault();
            selectEntry(suggestions[activeIndex]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        required
        className="w-full rounded-xl border border-brand-border px-4 py-3 text-[13px] outline-none focus:border-[rgba(var(--brand-stratus-blue-rgb),0.45)]"
        placeholder={placeholder}
      />

      {open && suggestions.length > 0 ? (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-brand-border bg-white py-1 shadow-lg"
        >
          {suggestions.map((entry, index) => (
            <li key={entry.id} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectEntry(entry)}
                className={cn(
                  "flex w-full flex-col items-start px-4 py-2.5 text-left transition",
                  index === activeIndex ? "bg-brand-black/5" : "hover:bg-brand-canvas",
                )}
              >
                <span className="text-[13px] font-medium text-brand-ink">{entry.label}</span>
                <span className="text-[11px] text-brand-ink-soft">
                  {entry.suggestedCompetitors.slice(0, 3).join(", ")}
                  {entry.suggestedCompetitors.length > 3 ? "…" : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

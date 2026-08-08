"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  brands: string[];
  onChange: (brands: string[]) => void;
  placeholder?: string;
  className?: string;
};

export function CompetitorBrandsEditor({
  brands,
  onChange,
  placeholder = "Add a competitor brand",
  className,
}: Props) {
  const [draft, setDraft] = useState("");

  function addBrand() {
    const next = draft.trim();
    if (!next) return;
    const exists = brands.some((b) => b.toLowerCase() === next.toLowerCase());
    if (!exists) onChange([...brands, next]);
    setDraft("");
  }

  function removeBrand(brand: string) {
    onChange(brands.filter((b) => b !== brand));
  }

  return (
    <div className={cn("space-y-3", className)}>
      {brands.length > 0 ? (
        <ul className="space-y-2">
          {brands.map((brand) => (
            <li
              key={brand}
              className="flex items-center justify-between gap-3 rounded-xl border border-brand-border/70 bg-white/80 px-3 py-2"
            >
              <span className="text-[13px] text-brand-ink">{brand}</span>
              <button
                type="button"
                onClick={() => removeBrand(brand)}
                aria-label={`Remove ${brand}`}
                className="rounded-lg p-1 text-brand-ink-faint transition hover:bg-brand-canvas hover:text-brand-ink"
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[12px] text-brand-ink-faint">No competitors yet. Add brands your team wants to track.</p>
      )}

      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addBrand();
            }
          }}
          placeholder={placeholder}
          className="min-w-0 flex-1 rounded-xl border border-brand-border/70 bg-white/80 px-3 py-2 text-[13px] text-brand-ink outline-none focus:border-[rgba(var(--brand-stratus-blue-rgb),0.45)]"
        />
        <button
          type="button"
          onClick={addBrand}
          disabled={!draft.trim()}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-medium transition",
            draft.trim()
              ? "bg-brand-black text-white hover:opacity-90"
              : "bg-brand-canvas text-brand-ink-faint",
          )}
        >
          <Plus className="size-3.5" />
          Add
        </button>
      </div>
    </div>
  );
}

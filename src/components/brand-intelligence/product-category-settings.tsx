"use client";

import { useEffect, useState } from "react";
import { Package, Pencil, Plus, X } from "lucide-react";
import { Button } from "@/design-system";
import { AppModal } from "@/components/ui/app-modal";
import { ProductCategoryPicker } from "@/components/brand-intelligence/product-category-picker";
import {
  INDUSTRY_CATALOG,
  formatProductCategories,
  parseProductCategories,
} from "@/lib/brand-intel/industry-catalog";
import { cn } from "@/lib/utils";

type Props = {
  value: string;
  onChange: (value: string) => void;
};

function Chip({ children }: { children: string }) {
  return (
    <span className="rounded-full bg-brand-black px-2 py-0.5 text-[11px] font-semibold text-white">
      {children}
    </span>
  );
}

function toggleCategory(selected: string[], label: string): string[] {
  const key = label.toLowerCase();
  const exists = selected.some((item) => item.toLowerCase() === key);
  if (exists) return selected.filter((item) => item.toLowerCase() !== key);
  return [...selected, label];
}

export function ProductCategorySettings({ value, onChange }: Props) {
  const chosen = parseProductCategories(value);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>(chosen);
  const [custom, setCustom] = useState("");

  useEffect(() => {
    if (open) {
      setDraft(parseProductCategories(value));
      setCustom("");
    }
  }, [open, value]);

  function addCustom(label: string) {
    const next = label.trim();
    if (!next) return;
    setDraft((prev) => {
      if (prev.some((item) => item.toLowerCase() === next.toLowerCase())) return prev;
      return [...prev, next];
    });
    setCustom("");
  }

  function handleSave() {
    onChange(formatProductCategories(draft));
    setOpen(false);
  }

  return (
    <>
      <div>
        {chosen.length > 0 ? (
          <div className="flex items-start gap-3">
            <Package className="mt-0.5 size-4 shrink-0 text-brand-stratus-blue" />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-brand-ink">Chosen categories</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {chosen.map((label) => (
                  <Chip key={label}>{label}</Chip>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="mt-3 inline-flex items-center gap-1 text-[12px] font-semibold text-brand-stratus-blue"
              >
                <Pencil className="size-3" />
                Update category
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <Package className="mt-0.5 size-4 shrink-0 text-brand-ink-faint" />
              <div>
                <p className="text-[13px] font-semibold text-brand-ink">No category chosen</p>
                <p className="mt-0.5 text-[12px] text-brand-ink-soft">
                  Pick the product types Brand Intelligence should track.
                </p>
              </div>
            </div>
            <Button type="button" className="w-full sm:w-auto" onClick={() => setOpen(true)}>
              Choose category
            </Button>
          </div>
        )}
      </div>

      <AppModal
        open={open}
        onClose={() => setOpen(false)}
        panelClassName="max-h-[min(92dvh,800px)] lg:max-w-lg"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-[16px] font-bold text-brand-ink">Update product category</h3>
            <p className="mt-0.5 text-[12px] text-brand-ink-soft">
              Add, update, or remove categories used for OSINT sweeps.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="flex size-8 shrink-0 items-center justify-center rounded-full text-brand-ink-soft hover:bg-black/[0.04] hover:text-brand-ink"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        {draft.length > 0 ? (
          <div className="mb-4 flex flex-wrap gap-1.5">
            {draft.map((label) => (
              <span
                key={label}
                className="inline-flex items-center gap-1 rounded-full bg-brand-black px-2.5 py-1 text-[11px] font-semibold text-white"
              >
                {label}
                <button
                  type="button"
                  onClick={() => setDraft((prev) => prev.filter((item) => item !== label))}
                  className="rounded-full p-0.5 hover:bg-white/15"
                  aria-label={`Remove ${label}`}
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="mb-4 text-[12px] text-brand-ink-faint">Nothing selected yet.</p>
        )}

        <label className="mb-1.5 block text-[12px] font-semibold text-brand-ink">Add a category</label>
        <div className="mb-4 flex gap-2">
          <ProductCategoryPicker
            value={custom}
            onChange={setCustom}
            onIndustrySelect={(entry) => {
              if (entry) addCustom(entry.label);
            }}
            placeholder="Search or type a category"
            required={false}
            className="min-w-0 flex-1"
          />
          <button
            type="button"
            onClick={() => addCustom(custom)}
            disabled={!custom.trim()}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-medium transition",
              custom.trim()
                ? "bg-brand-black text-white hover:opacity-90"
                : "bg-brand-canvas text-brand-ink-faint",
            )}
          >
            <Plus className="size-3.5" />
            Add
          </button>
        </div>

        <p className="mb-2 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-brand-ink-faint">
          Catalog
        </p>
        <div className="mb-5 flex flex-wrap gap-2">
          {INDUSTRY_CATALOG.map((entry) => {
            const active = draft.some((item) => item.toLowerCase() === entry.label.toLowerCase());
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => setDraft((prev) => toggleCategory(prev, entry.label))}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-[12px] font-medium transition",
                  active
                    ? "border-brand-black bg-brand-black text-white"
                    : "border-brand-border bg-white text-brand-ink hover:border-brand-black/30",
                )}
              >
                {entry.label}
              </button>
            );
          })}
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave}>
            Save categories
          </Button>
        </div>
      </AppModal>
    </>
  );
}

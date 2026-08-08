"use client";

import { useMemo, useState } from "react";
import {
  Building2,
  Car,
  Check,
  ChevronDown,
  Cpu,
  Factory,
  GraduationCap,
  Hammer,
  HeartPulse,
  Landmark,
  Package,
  Pill,
  Plus,
  Search,
  ShoppingBag,
  Truck,
  UtensilsCrossed,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { SCOUT_INDUSTRIES } from "@/lib/scouting-data";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/design-system";

const INDUSTRY_ICONS: Record<string, LucideIcon> = {
  Manufacturing: Factory,
  "Real Estate": Building2,
  Technology: Cpu,
  "Financial Services": Landmark,
  Healthcare: HeartPulse,
  Retail: ShoppingBag,
  FMCG: Package,
  Construction: Hammer,
  Automotive: Car,
  Pharmaceuticals: Pill,
  Education: GraduationCap,
  Hospitality: UtensilsCrossed,
  Logistics: Truck,
};

function getIndustryMeta(industry: string) {
  const words = industry.split(/\s+/).filter(Boolean);
  const initials =
    words.length > 1
      ? words.map((w) => w[0]).join("").slice(0, 3).toUpperCase()
      : industry.slice(0, 3).toUpperCase();
  return { initials };
}

type Props = {
  industries: string[];
  onIndustriesChange: (industries: string[]) => void;
  className?: string;
};

function IndustryChip({
  industry,
  onRemove,
}: {
  industry: string;
  onRemove: () => void;
}) {
  const meta = getIndustryMeta(industry);
  const Icon = INDUSTRY_ICONS[industry] ?? Building2;

  return (
    <span
      className="flex shrink-0 items-center gap-1 rounded-full bg-brand-yellow py-1 pl-1 pr-1.5 text-[11px] font-bold text-brand-ink shadow-[var(--shadow-brand-yellow-sm)]"
      title={industry}
    >
      <span className="flex size-5 items-center justify-center rounded-full bg-white/80 text-brand-ink">
        <Icon className="size-3" />
      </span>
      <span className="tracking-wide">{meta.initials}</span>
      <button
        type="button"
        onClick={onRemove}
        className="flex size-3.5 shrink-0 items-center justify-center rounded-full hover:bg-brand-ink/10"
        aria-label={`Remove ${industry}`}
      >
        <X className="size-2.5" />
      </button>
    </span>
  );
}

function IndustryOptionRow({
  industry,
  selected,
  onToggle,
}: {
  industry: string;
  selected: boolean;
  onToggle: () => void;
}) {
  const meta = getIndustryMeta(industry);
  const Icon = INDUSTRY_ICONS[industry] ?? Building2;

  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-colors",
        selected ? "bg-brand-yellow/35 text-brand-ink" : "text-brand-ink-soft hover:bg-brand-app hover:text-brand-ink",
      )}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white text-brand-ink shadow-[var(--shadow-brand-sm)]">
        <Icon className="size-4" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-2">
          <span className="rounded-md bg-brand-app px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-brand-ink">
            {meta.initials}
          </span>
          <span className="truncate text-[12.5px] font-semibold text-brand-ink">{industry}</span>
        </span>
      </span>
      <span
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors",
          selected ? "border-brand-ink bg-brand-yellow text-brand-ink" : "border-brand-border bg-white text-transparent",
        )}
      >
        {selected ? <Check className="size-3" strokeWidth={2.5} /> : null}
      </span>
    </button>
  );
}

export function IndustrySelector({ industries, onIndustriesChange, className }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const normalizedQuery = query.trim().toLowerCase();

  const filteredIndustries = useMemo(() => {
    if (!normalizedQuery) return [...SCOUT_INDUSTRIES];
    return SCOUT_INDUSTRIES.filter((industry) => industry.toLowerCase().includes(normalizedQuery));
  }, [normalizedQuery]);

  function toggleIndustry(industry: string) {
    if (industries.includes(industry)) {
      onIndustriesChange(industries.filter((i) => i !== industry));
      return;
    }
    onIndustriesChange([...industries, industry]);
  }

  function removeIndustry(industry: string) {
    onIndustriesChange(industries.filter((i) => i !== industry));
  }

  function selectAllVisible() {
    const merged = new Set([...industries, ...filteredIndustries]);
    onIndustriesChange([...merged]);
  }

  function clearAll() {
    onIndustriesChange([]);
  }

  return (
    <div className={cn("flex min-w-0 items-center", className)}>
      <Building2 className="mr-1.5 size-4 shrink-0 text-brand-ink-soft" aria-hidden />

      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
        {industries.length > 0 ? (
          industries.map((industry) => (
            <IndustryChip
              key={industry}
              industry={industry}
              onRemove={() => removeIndustry(industry)}
            />
          ))
        ) : (
          <span className="shrink-0 text-[11.5px] font-medium text-brand-ink-faint">Any industry</span>
        )}

        <DropdownMenu open={open} onOpenChange={setOpen}>
          <DropdownMenuTrigger
            className={cn(
              "flex shrink-0 items-center gap-1 rounded-full border border-brand-border bg-white px-2.5 py-1 text-[11.5px] font-semibold text-brand-ink shadow-[var(--shadow-brand-sm)] transition-colors hover:bg-brand-app",
              industries.length === 0 && "border-dashed text-brand-ink-soft",
            )}
          >
            {industries.length === 0 ? (
              <>
                Select industries
                <ChevronDown className="size-3 opacity-60" />
              </>
            ) : (
              <>
                <Plus className="size-3" />
                Add
                <ChevronDown className="size-3 opacity-60" />
              </>
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[320px] p-0">
            <div className="border-b border-brand-border p-2.5">
              <div className="flex items-center gap-2 rounded-lg border border-brand-border bg-brand-app px-2.5 py-1.5">
                <Search className="size-3.5 shrink-0 text-brand-ink-faint" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search industries…"
                  className="min-w-0 flex-1 bg-transparent text-[12px] text-brand-ink outline-none placeholder:text-brand-ink-faint"
                />
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={selectAllVisible}
                  className="text-[11px] font-semibold text-brand-ink-soft hover:text-brand-ink"
                >
                  Select visible
                </button>
                <button
                  type="button"
                  onClick={clearAll}
                  className="text-[11px] font-semibold text-brand-ink-soft hover:text-brand-ink"
                >
                  Clear all
                </button>
              </div>
            </div>

            <div className="max-h-[320px] overflow-y-auto p-2">
              {filteredIndustries.length === 0 ? (
                <p className="px-2 py-4 text-center text-[12px] text-brand-ink-faint">No industries match your search.</p>
              ) : (
                <div className="flex flex-col gap-1">
                  {filteredIndustries.map((industry) => (
                    <IndustryOptionRow
                      key={industry}
                      industry={industry}
                      selected={industries.includes(industry)}
                      onToggle={() => toggleIndustry(industry)}
                    />
                  ))}
                </div>
              )}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

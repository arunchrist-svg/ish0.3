"use client";

import { useMemo, useState } from "react";
import { Check, Filter } from "lucide-react";
import { cn } from "@/lib/utils";
import { AppModal } from "@/components/ui/app-modal";

export type FacetOption = { id: string; label: string };
export type FacetGroup = { id: string; label: string; filters: FacetOption[] };
export type FacetSortOption = { value: string; label: string };

type Props = {
  ariaLabel: string;
  emptyHint?: string;
  quick: string | null;
  panel: Set<string>;
  sort: string;
  quickOptions: FacetOption[];
  panelGroups: FacetGroup[];
  sortOptions: FacetSortOption[];
  onQuickChange: (next: string | null) => void;
  onPanelChange: (next: Set<string>) => void;
  onSortChange: (next: string) => void;
  size?: number;
  className?: string;
};

function CheckRow({
  label,
  selected,
  onClick,
  radio,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  radio?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
        selected ? "bg-[#eef3fb]" : "hover:bg-[#f4f6fa]",
      )}
    >
      <span
        className={cn(
          "flex size-[18px] shrink-0 items-center justify-center border",
          radio ? "rounded-full" : "rounded-[5px]",
          selected
            ? "border-brand-stratus-blue bg-brand-stratus-blue text-white"
            : "border-[#d5dbe6] bg-[#ffffff]",
        )}
      >
        {selected ? <Check className="size-3" strokeWidth={3} /> : null}
      </span>
      <span
        className={cn(
          "text-[13.5px] leading-snug",
          selected ? "font-semibold text-brand-ink" : "font-medium text-[#4b5568]",
        )}
      >
        {label}
      </span>
    </button>
  );
}

function toggleQuick(current: string | null, id: string): string | null {
  return current === id ? null : id;
}

function togglePanel(current: Set<string>, id: string): Set<string> {
  const next = new Set(current);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export function FacetFilterBar({
  ariaLabel,
  emptyHint = "Choose how to view this list",
  quick,
  panel,
  sort,
  quickOptions,
  panelGroups,
  sortOptions,
  onQuickChange,
  onPanelChange,
  onSortChange,
  size = 32,
  className,
}: Props) {
  const categories = useMemo(
    () => [
      { id: "quick", label: "Quick" },
      { id: "sort", label: "Sort" },
      ...panelGroups.map((group) => ({ id: group.id, label: group.label })),
    ],
    [panelGroups],
  );

  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState(categories[0]?.id ?? "quick");
  const [draftQuick, setDraftQuick] = useState<string | null>(quick);
  const [draftPanel, setDraftPanel] = useState<Set<string>>(panel);
  const [draftSort, setDraftSort] = useState(sort);

  const appliedCount = panel.size + (quick ? 1 : 0);
  const draftCount = draftPanel.size + (draftQuick ? 1 : 0);

  function openMenu() {
    setDraftQuick(quick);
    setDraftPanel(new Set(panel));
    setDraftSort(sort);
    setCategory("quick");
    setOpen(true);
  }

  function closeMenu() {
    setOpen(false);
  }

  function apply() {
    onQuickChange(draftQuick);
    onPanelChange(draftPanel);
    onSortChange(draftSort);
    setOpen(false);
  }

  function clearDraft() {
    setDraftQuick(null);
    setDraftPanel(new Set());
  }

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {
      quick: draftQuick ? 1 : 0,
      sort: 0,
    };
    for (const group of panelGroups) {
      counts[group.id] = group.filters.filter((f) => draftPanel.has(f.id)).length;
    }
    return counts;
  }, [draftQuick, draftPanel, panelGroups]);

  const options = (() => {
    if (category === "quick") {
      return quickOptions.map((item) => (
        <CheckRow
          key={item.id}
          radio
          label={item.label}
          selected={draftQuick === item.id}
          onClick={() => setDraftQuick(toggleQuick(draftQuick, item.id))}
        />
      ));
    }
    if (category === "sort") {
      return sortOptions.map((option) => (
        <CheckRow
          key={option.value}
          radio
          label={option.label}
          selected={draftSort === option.value}
          onClick={() => setDraftSort(option.value)}
        />
      ));
    }
    const group = panelGroups.find((g) => g.id === category);
    if (!group) return null;
    return group.filters.map((filter) => (
      <CheckRow
        key={filter.id}
        label={filter.label}
        selected={draftPanel.has(filter.id)}
        onClick={() => setDraftPanel(togglePanel(draftPanel, filter.id))}
      />
    ));
  })();

  return (
    <div className={cn("relative shrink-0", className)}>
      <button
        type="button"
        onClick={() => (open ? closeMenu() : openMenu())}
        aria-expanded={open}
        aria-label={ariaLabel}
        className={cn(
          "relative flex shrink-0 items-center justify-center rounded-full outline-none",
          open || appliedCount > 0
            ? "bg-brand-stratus-blue text-white shadow-[var(--shadow-brand-sm)]"
            : "bg-[#ffffff] text-brand-ink-soft shadow-[var(--shadow-brand-sm)] hover:text-brand-ink",
        )}
        style={{ width: size, height: size }}
      >
        <Filter className="size-3.5" />
        {appliedCount > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex size-3.5 items-center justify-center rounded-full bg-brand-stratus-yellow text-[8px] font-bold text-brand-ink">
            {appliedCount}
          </span>
        ) : null}
      </button>

      <AppModal
        open={open}
        onClose={closeMenu}
        className="!bg-black/50 !backdrop-blur-none lg:!bg-black/50 lg:!backdrop-blur-none"
        panelClassName="ish-solid-sheet !max-h-[min(36rem,88dvh)] overflow-hidden !p-0 lg:!max-w-[440px] lg:!rounded-[20px] [&>div.mx-auto]:hidden [&>button]:bg-[#ffffff] [&>button]:shadow-[0_0_0_1px_#e8ebf1]"
      >
        <div className="flex h-[min(32rem,calc(88dvh-2rem))] flex-col bg-[#ffffff]">
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[#e8ebf1] px-5 py-4 pr-14">
            <div>
              <p className="text-[16px] font-bold tracking-tight text-brand-ink">Filters</p>
              <p className="mt-0.5 text-[12px] text-brand-ink-faint">
                {draftCount > 0 ? `${draftCount} selected` : emptyHint}
              </p>
            </div>
            {draftCount > 0 ? (
              <button
                type="button"
                className="text-[12px] font-semibold text-brand-stratus-blue hover:underline"
                onClick={clearDraft}
              >
                Clear all
              </button>
            ) : null}
          </div>

          <div className="flex min-h-0 flex-1">
            <nav className="w-[38%] shrink-0 overflow-y-auto border-r border-[#e8ebf1] bg-[#f4f6fa]">
              {categories.map((item) => {
                const count = categoryCounts[item.id] ?? 0;
                const selected = category === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setCategory(item.id)}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-[13px] transition-colors",
                      selected
                        ? "bg-[#ffffff] font-semibold text-brand-ink shadow-[inset_3px_0_0_#83a2db]"
                        : "font-medium text-[#6b7280] hover:bg-[#eceff5] hover:text-brand-ink",
                    )}
                  >
                    <span>{item.label}</span>
                    {count > 0 ? (
                      <span className="flex size-5 items-center justify-center rounded-full bg-brand-stratus-blue text-[10px] font-bold text-white">
                        {count}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </nav>
            <div className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-[#ffffff] p-3">{options}</div>
          </div>

          <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-[#e8ebf1] bg-[#ffffff] p-4">
            <button
              type="button"
              onClick={closeMenu}
              className="h-10 rounded-xl border border-[#d5dbe6] bg-[#ffffff] text-[13px] font-semibold text-brand-ink hover:bg-[#f4f6fa]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={apply}
              className="h-10 rounded-xl bg-brand-stratus-blue text-[13px] font-semibold text-white hover:brightness-95"
            >
              Apply
            </button>
          </div>
        </div>
      </AppModal>
    </div>
  );
}

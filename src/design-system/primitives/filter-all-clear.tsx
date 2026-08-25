"use client";

import { cn } from "@/lib/utils";

type Props = {
  onAll: () => void;
  onClear: () => void;
  /** True when every option in the group is selected. */
  allSelected?: boolean;
  /** True when nothing in the group is selected. */
  noneSelected?: boolean;
  /** Accessible name for the control group. */
  label?: string;
  className?: string;
  allLabel?: string;
  clearLabel?: string;
};

/**
 * Shared All / Clear pill for filter chip groups (scout, settings, brand intel).
 * Matches the district-row capsule: soft canvas shell, blue labels.
 */
export function FilterAllClear({
  onAll,
  onClear,
  allSelected = false,
  noneSelected = false,
  label = "Selection",
  className,
  allLabel = "All",
  clearLabel = "Clear",
}: Props) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center rounded-full bg-brand-canvas/90 p-0.5 shadow-[inset_0_0_0_1px_rgba(var(--brand-stratus-blue-rgb),0.10)]",
        className,
      )}
      role="group"
      aria-label={label}
    >
      <button
        type="button"
        onClick={onAll}
        disabled={allSelected}
        className={cn(
          "rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors",
          allSelected
            ? "bg-white text-brand-ink shadow-[var(--shadow-brand-sm)]"
            : "text-brand-stratus-blue hover:text-brand-ink disabled:text-brand-ink-faint",
        )}
      >
        {allLabel}
      </button>
      <button
        type="button"
        onClick={onClear}
        disabled={noneSelected}
        className={cn(
          "rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors",
          noneSelected
            ? "bg-white text-brand-ink shadow-[var(--shadow-brand-sm)]"
            : "text-brand-stratus-blue hover:text-brand-ink disabled:text-brand-ink-faint",
        )}
      >
        {clearLabel}
      </button>
    </div>
  );
}

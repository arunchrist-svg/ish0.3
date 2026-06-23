import { cn } from "@/lib/utils";

type ScoutCardSurfaceOpts = {
  isSelected: boolean;
  isPrimary: boolean;
  disabled?: boolean;
  layout?: "column" | "row";
  className?: string;
};

/** Shared scout card chrome — selected uses queue-style yellow gradient (Stratus overrides in tokens.css). */
export function scoutCardSurface({
  isSelected,
  isPrimary,
  disabled = false,
  layout = "column",
  className,
}: ScoutCardSurfaceOpts) {
  return cn(
    "group relative cursor-pointer overflow-hidden rounded-2xl transition-all duration-200",
    layout === "column" ? "flex flex-col" : "flex w-full items-center gap-3 text-left",
    disabled && "cursor-not-allowed opacity-50",
    isSelected
      ? "ish-scout-card-selected"
      : isPrimary
      ? "bg-white shadow-[var(--shadow-ish)] ring-[1.5px] ring-ish-ink/25"
      : "bg-white shadow-[var(--shadow-ish-sm)] hover:shadow-[var(--shadow-ish)] hover:-translate-y-0.5",
    className,
  );
}

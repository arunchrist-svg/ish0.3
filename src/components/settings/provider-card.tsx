import { CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const BADGE_COLORS: Record<string, string> = {
  Free: "bg-brand-stratus-blue/15 text-brand-ink",
  "Free tier": "bg-brand-stratus-blue/15 text-brand-ink",
  Paid: "bg-brand-yellow-soft text-brand-ink",
};

function Badge({ label }: { label: string }) {
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", BADGE_COLORS[label] ?? "bg-brand-app text-brand-ink-soft")}>
      {label}
    </span>
  );
}

export function ProviderCard<T extends string>({
  value,
  selected,
  label,
  desc,
  badge,
  onSelect,
}: {
  value: T;
  selected: boolean;
  label: string;
  desc: string;
  badge: string;
  onSelect: (v: T) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className={cn(
        "relative w-full rounded-[18px] border p-4 text-left transition-all duration-150",
        selected
          ? "border-brand-yellow/60 bg-brand-yellow/10 shadow-[var(--shadow-brand-yellow-sm)] ring-1 ring-brand-yellow/30"
          : "border-brand-border bg-white hover:border-brand-ink-soft",
      )}
    >
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[13.5px] font-bold text-brand-ink">{label}</span>
        <div className="flex items-center gap-2">
          <Badge label={badge} />
          {selected && <CheckCircle className="size-4 text-brand-ink" />}
        </div>
      </div>
      <p className="text-[12px] leading-relaxed text-brand-ink-soft">{desc}</p>
    </button>
  );
}

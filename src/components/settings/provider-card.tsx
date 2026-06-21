import { CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const BADGE_COLORS: Record<string, string> = {
  Free: "bg-ish-green/15 text-[#1f8050]",
  "Free tier": "bg-ish-green/15 text-[#1f8050]",
  Paid: "bg-[#fbe9c4] text-[#8a5a00]",
};

function Badge({ label }: { label: string }) {
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", BADGE_COLORS[label] ?? "bg-ish-app text-ish-ink-soft")}>
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
          ? "border-ish-ink bg-ish-yellow/10 shadow-[var(--shadow-ish-yellow-sm)]"
          : "border-ish-border bg-white hover:border-ish-ink-soft",
      )}
    >
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[13.5px] font-bold text-ish-ink">{label}</span>
        <div className="flex items-center gap-2">
          <Badge label={badge} />
          {selected && <CheckCircle className="size-4 text-ish-ink" />}
        </div>
      </div>
      <p className="text-[12px] leading-relaxed text-ish-ink-soft">{desc}</p>
    </button>
  );
}

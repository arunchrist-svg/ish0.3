"use client";

import { cn } from "@/lib/utils";
import { Users } from "lucide-react";
import type { Company } from "@/lib/scouting-data";

type Props = {
  company: Company;
  isSelected: boolean;
  isPrimary: boolean;
  onToggleSelect: () => void;
  onView: () => void;
};

function ScoreRing({ score }: { score: number }) {
  const r = 13;
  const cx = 18;
  const cy = 18;
  const circ = 2 * Math.PI * r;
  const filled = (score / 100) * circ;
  const color = score > 75 ? "#3fbe82" : score > 50 ? "#e8a000" : "#e57373";

  return (
    <svg width="36" height="36" viewBox="0 0 36 36" className="shrink-0">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e7e6ea" strokeWidth="3" />
      <circle
        cx={cx} cy={cy} r={r}
        fill="none"
        stroke={color}
        strokeWidth="3"
        strokeDasharray={`${filled} ${circ - filled}`}
        strokeLinecap="round"
        transform="rotate(-90 18 18)"
      />
      <text x="18" y="22" textAnchor="middle" fontSize="9" fontWeight="800" fill="#1a1a1f">
        {score}
      </text>
    </svg>
  );
}

export function CompanyTile({ company, isSelected, isPrimary, onToggleSelect, onView }: Props) {
  return (
    <div
      className={cn(
        "flex w-full flex-col overflow-hidden rounded-[18px] bg-white text-left transition-all duration-150",
        isPrimary
          ? "ring-2 ring-blue-500 shadow-[var(--shadow-ish)]"
          : "shadow-[var(--shadow-ish-sm)] hover:shadow-[var(--shadow-ish)]",
        isSelected && !isPrimary && "ring-2 ring-ish-green",
      )}
    >
      <button
        type="button"
        onClick={onToggleSelect}
        className="flex w-full items-center justify-between px-4 pt-3.5 pb-1"
        aria-label={isSelected ? `Deselect ${company.name}` : `Select ${company.name}`}
      >
        <span
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-all",
            isSelected
              ? "border-ish-green bg-ish-green"
              : "border-ish-border bg-white",
          )}
        >
          {isSelected && (
            <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
              <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </span>
        <ScoreRing score={company.giftScore} />
      </button>

      <button
        type="button"
        onClick={onView}
        className="w-full cursor-pointer px-4 pb-4 pt-1 text-left"
        aria-label={`View ${company.name}`}
      >
        <div className="mb-3">
          <div className="mb-1.5 text-3xl leading-none">{company.logo}</div>
          <div className="text-[14px] font-bold leading-tight text-ish-ink">{company.name}</div>
          <div className="mt-0.5 text-[11px] text-ish-ink-soft">{company.type}</div>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-ish-ink-faint">
          <Users className="size-3 shrink-0" />
          <span>{company.employees}</span>
          <span className="mx-1 text-ish-border">·</span>
          <span>{company.city}</span>
        </div>
      </button>
    </div>
  );
}

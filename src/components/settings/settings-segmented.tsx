"use client";

import { cn } from "@/lib/utils";

export function SettingsSegmented<T extends string>({
  value,
  onChange,
  options,
  disabledValue,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  disabledValue?: T;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex max-w-full flex-wrap rounded-full border border-brand-stratus-blue/25 bg-white/80 p-0.5 shadow-[var(--shadow-brand-sm)]",
        className,
      )}
    >
      {options.map((option) => {
        const active = value === option.value;
        const disabled = option.value === disabledValue && !active;
        return (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors",
              active ? "bg-brand-stratus-blue text-white" : "text-brand-ink-soft hover:text-brand-ink",
              disabled && "cursor-not-allowed opacity-40",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

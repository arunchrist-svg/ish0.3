"use client";

import { getPasswordStrength, type PasswordStrengthLevel } from "@/lib/auth/password-strength";
import { cn } from "@/lib/utils";

const SEGMENT_ACTIVE: Record<Exclude<PasswordStrengthLevel, "empty">, string> = {
  weak: "bg-score-low",
  fair: "bg-score-mid",
  good: "bg-brand-stratus-blue",
  strong: "bg-score-high",
};

const LABEL_COLOR: Record<Exclude<PasswordStrengthLevel, "empty">, string> = {
  weak: "text-score-low",
  fair: "text-score-mid",
  good: "text-brand-stratus-blue",
  strong: "text-score-high",
};

type PasswordStrengthMeterProps = {
  password: string;
  className?: string;
};

export function PasswordStrengthMeter({ password, className }: PasswordStrengthMeterProps) {
  const { level, label, segments } = getPasswordStrength(password);

  if (level === "empty") return null;

  return (
    <div className={cn("mt-2.5 space-y-1.5", className)} aria-live="polite">
      <div className="flex gap-1.5" role="meter" aria-label={`Password strength: ${label}`} aria-valuemin={0} aria-valuemax={4} aria-valuenow={segments} aria-valuetext={label}>
        {Array.from({ length: 4 }, (_, i) => (
          <span
            key={i}
            className={cn(
              "h-1 flex-1 rounded-full bg-brand-border transition-colors",
              i < segments && SEGMENT_ACTIVE[level],
            )}
          />
        ))}
      </div>
      <p className={cn("text-[12px] font-medium", LABEL_COLOR[level])}>
        {label}
      </p>
    </div>
  );
}

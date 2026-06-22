"use client";

import { Check, Building2, Users, Phone } from "lucide-react";
import { cn } from "@/lib/utils";

type Step = {
  id: number;
  label: string;
  icon: React.ElementType;
};

const STEPS: Step[] = [
  { id: 1, label: "Select Companies", icon: Building2 },
  { id: 2, label: "Review Leads", icon: Users },
  { id: 3, label: "Extract Contacts", icon: Phone },
];

type Props = {
  currentStep: 1 | 2 | 3;
  companiesCount: number;
  leadsCount: number;
};

export function ScoutingWizard({ currentStep, companiesCount, leadsCount }: Props) {
  function subLabel(id: number): string | null {
    if (id === 1 && companiesCount > 0) return `${companiesCount} selected`;
    if (id === 2 && currentStep >= 2 && leadsCount > 0) return `${leadsCount} found`;
    return null;
  }

  return (
    <div className="border-b border-ish-border bg-white px-6 py-2.5">
      <div className="flex items-start justify-center gap-0">
        {STEPS.map((step, idx) => {
          const isCompleted = step.id < currentStep;
          const isCurrent = step.id === currentStep;
          const isPending = step.id > currentStep;
          const Icon = step.icon;
          const sub = subLabel(step.id);

          return (
            <div key={step.id} className="flex items-start">
              {/* Step node */}
              <div className="flex flex-col items-center gap-2" style={{ minWidth: 90 }}>
                {/* Circle */}
                <div
                  className={cn(
                    "flex size-10 items-center justify-center rounded-full transition-all duration-300",
                    isCompleted && "bg-ish-green shadow-[0_2px_8px_rgba(63,190,130,0.35)]",
                    isCurrent && "bg-ish-yellow shadow-[var(--shadow-ish-yellow-sm)]",
                    isPending && "bg-ish-border",
                  )}
                >
                  {isCompleted ? (
                    <Check className="size-[18px] text-white" strokeWidth={2.5} />
                  ) : (
                    <Icon
                      className={cn(
                        "size-[18px] transition-colors",
                        isCurrent ? "text-ish-ink" : "text-ish-ink-faint",
                      )}
                    />
                  )}
                </div>

                {/* Label + sub-label */}
                <div className="flex flex-col items-center gap-0.5 text-center">
                  <span
                    className={cn(
                      "text-[11.5px] font-semibold leading-tight",
                      isCurrent ? "text-ish-ink" : isCompleted ? "text-ish-ink-soft" : "text-ish-ink-faint",
                    )}
                  >
                    {step.label}
                  </span>
                  {sub ? (
                    <span className="text-[10px] font-medium text-ish-ink-faint">{sub}</span>
                  ) : (
                    <span className="text-[10px] text-transparent select-none">—</span>
                  )}
                </div>
              </div>

              {/* Connector line between steps */}
              {idx < STEPS.length - 1 && (
                <div className="relative mx-1 mt-5 h-0.5 w-16 overflow-hidden rounded-full bg-ish-border sm:w-20">
                  <div
                    className={cn(
                      "absolute inset-y-0 left-0 rounded-full bg-ish-green transition-all duration-500",
                    )}
                    style={{ width: step.id < currentStep ? "100%" : "0%" }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

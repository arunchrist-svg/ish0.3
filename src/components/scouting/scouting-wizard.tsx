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
  return (
    <div className="flex items-center justify-center gap-2 border-b border-ish-border bg-white px-6 py-4">
      {STEPS.map((step, idx) => {
        const isCompleted = step.id < currentStep;
        const isCurrent = step.id === currentStep;
        const Icon = step.icon;

        return (
          <div key={step.id} className="flex items-center">
            {/* Step circle */}
            <div className="flex items-center gap-2.5">
              <div
                className={cn(
                  "flex size-9 items-center justify-center rounded-full text-sm font-bold transition-all",
                  isCompleted && "bg-ish-green text-white",
                  isCurrent && "bg-ish-yellow text-ish-ink shadow-[var(--shadow-ish-yellow)]",
                  !isCompleted && !isCurrent && "bg-ish-app text-ish-ink-faint",
                )}
              >
                {isCompleted ? <Check className="size-4" /> : <Icon className="size-4" />}
              </div>
              <div className="flex flex-col">
                <span
                  className={cn(
                    "text-[12px] font-semibold",
                    isCurrent ? "text-ish-ink" : "text-ish-ink-soft",
                  )}
                >
                  {step.label}
                </span>
                {step.id === 1 && companiesCount > 0 && (
                  <span className="text-[10px] text-ish-ink-faint">
                    {companiesCount} selected
                  </span>
                )}
                {step.id === 2 && currentStep >= 2 && leadsCount > 0 && (
                  <span className="text-[10px] text-ish-ink-faint">
                    {leadsCount} found
                  </span>
                )}
              </div>
            </div>

            {/* Connector line */}
            {idx < STEPS.length - 1 && (
              <div
                className={cn(
                  "mx-4 h-0.5 w-16 rounded-full transition-colors",
                  step.id < currentStep ? "bg-ish-green" : "bg-ish-border",
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { BottomSheet } from "@/design-system";
import { useHubAlerts } from "@/hooks/use-hub-alerts";
import { text } from "@/design-system/tokens";

export function HubAlertsButton({ className }: { className?: string }) {
  const alerts = useHubAlerts();
  const [open, setOpen] = useState(false);

  if (alerts.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "relative flex size-10 items-center lg:hidden justify-center rounded-full bg-amber-50 text-amber-700 shadow-ish-sm ring-1 ring-amber-200/80 active:scale-95",
          className,
        )}
        aria-label={`${alerts.length} workspace alert${alerts.length === 1 ? "" : "s"}`}
      >
        <AlertTriangle className="size-[18px]" strokeWidth={2.25} />
        {alerts.length > 1 ? (
          <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-amber-600 text-[9px] font-bold text-white">
            {alerts.length}
          </span>
        ) : null}
      </button>

      <BottomSheet open={open} onClose={() => setOpen(false)} title="Workspace alerts">
        <div className="space-y-3">
          {alerts.map((alert) => {
            const Icon = alert.icon;
            return (
              <div
                key={alert.id}
                className="rounded-2xl border border-amber-200/80 bg-amber-50/80 p-4"
              >
                <div className="flex gap-3">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
                    <Icon className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className={text.listTitle}>{alert.title}</div>
                    <p className={cn("mt-1", text.bodySoft)}>{alert.description}</p>
                    {alert.href ? (
                      <Link
                        href={alert.href}
                        onClick={() => setOpen(false)}
                        className="mt-2 inline-block text-[14px] font-semibold text-amber-900 underline"
                      >
                        {alert.hrefLabel ?? "Open"}
                      </Link>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </BottomSheet>
    </>
  );
}

export function HubHeaderActions({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      <HubAlertsButton />
      {children}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type TavilyUsageResponse = {
  configured: boolean;
  limitPerKey: number;
  totalUsed: number;
  totalLimit: number;
  totalRemaining: number;
  sessionUsed: number;
  percentUsed: number;
  keyCount: number;
  configuredKeyCount: number;
  exhaustedKeyCount: number;
  availableKeyCount: number;
  activeKeyId: string | null;
  activeKeyLabel: string | null;
  allKeysExhausted: boolean;
  configIssues?: string[];
  source: "tavily_account";
  keys: {
    id: string;
    label: string;
    used: number;
    limit: number;
    remaining: number;
    sessionUsed: number;
    exhausted: boolean;
    active: boolean;
    plan: string | null;
    fetchError?: string;
  }[];
};

function barTone(percent: number, allExhausted: boolean): string {
  if (allExhausted || percent >= 90) return "bg-red-500";
  if (percent >= 70) return "bg-amber-500";
  return "bg-emerald-500";
}

export function TavilyUsageMeter() {
  const [usage, setUsage] = useState<TavilyUsageResponse | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/usage/tavily", { cache: "no-store" });
      if (!res.ok) return;
      setUsage(await res.json());
    } catch {
      // ignore polling errors
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(refresh, 30000);
    const onRefresh = () => void refresh();
    window.addEventListener("tavily-usage-refresh", onRefresh);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("tavily-usage-refresh", onRefresh);
    };
  }, [refresh]);

  if (!usage?.configured) return null;

  const activeIndex = usage.keys.findIndex((k) => k.active);
  const keyPosition = activeIndex >= 0 ? activeIndex + 1 : usage.availableKeyCount > 0 ? 1 : 0;
  const tone = barTone(usage.percentUsed, usage.allKeysExhausted);
  const barWidth = Math.max(usage.percentUsed, usage.totalUsed > 0 ? 4 : 0);

  return (
    <div
      className="group relative mr-2 hidden min-w-[190px] flex-col gap-1 sm:flex"
      title="Live Tavily account credits (same as tavily.com dashboard)"
    >
      <div className="flex items-center justify-between gap-2 text-[11px] text-ish-ink-soft">
        <span className={cn("font-medium", usage.allKeysExhausted ? "text-red-600" : "text-ish-ink")}>Tavily</span>
        <span className={cn("text-right font-medium", usage.allKeysExhausted ? "text-red-600" : "text-ish-ink-soft")}>
          {usage.totalUsed}/{usage.totalLimit}
          {usage.keyCount > 1 ? (
            <span>
              {" "}
              · key {keyPosition}/{usage.keyCount}
            </span>
          ) : null}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-ish-border/60">
        <div
          className={cn("h-full rounded-full transition-all duration-500", tone)}
          style={{ width: `${barWidth}%` }}
        />
      </div>
      {usage.activeKeyLabel && !usage.allKeysExhausted ? (
        <p className="truncate text-[10px] text-ish-ink-faint">Active: {usage.activeKeyLabel}</p>
      ) : usage.configIssues?.[0] ? (
        <p className="truncate text-[10px] text-red-500" title={usage.configIssues.join(" ")}>
          {usage.configIssues[0]}
        </p>
      ) : null}
      <div className="pointer-events-none absolute left-0 top-full z-50 mt-2 hidden w-64 rounded-lg border border-ish-border bg-white p-3 shadow-lg group-hover:block">
        <p className="mb-2 text-[11px] font-semibold text-ish-ink">Tavily account credits</p>
        {usage.keys.map((k) => (
          <div key={k.id} className="mb-1.5 last:mb-0">
            <div className="flex justify-between text-[10px] text-ish-ink-soft">
              <span>
                {k.label}
                {k.active ? " · active" : ""}
                {k.exhausted ? " · exhausted" : ""}
              </span>
              <span>
                {k.fetchError ? "error" : `${k.used}/${k.limit}`}
                {k.sessionUsed > 0 ? ` (+${k.sessionUsed} session)` : ""}
              </span>
            </div>
            <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-ish-border/60">
              <div
                className={cn(
                  "h-full rounded-full",
                  k.exhausted ? "bg-red-400" : barTone(k.limit ? (k.used / k.limit) * 100 : 0, false),
                )}
                style={{ width: `${k.limit ? Math.min(100, (k.used / k.limit) * 100) : 0}%` }}
              />
            </div>
          </div>
        ))}
        <p className="mt-2 text-[10px] text-ish-ink-faint">
          Pulled live from Tavily. Session calls this dev server: {usage.sessionUsed}. If dashboard shows credits but this
          bar is full, paste your new dashboard key into TAVILY_API_KEY.
        </p>
      </div>
    </div>
  );
}

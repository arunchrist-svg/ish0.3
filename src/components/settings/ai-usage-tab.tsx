"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import { SettingsGroup, SettingsGroupDivider, SettingsRow } from "@/components/settings/settings-group";
import { cn } from "@/lib/utils";

type TavilyKey = {
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
};

type TavilyUsage = {
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
  keys: TavilyKey[];
};

type LlmUsage = {
  provider: string;
  anthropic: {
    configured: boolean;
    active: boolean;
    haikuModel: string;
    sonnetModel: string;
    maxOutputTokens: number | null;
  };
};

function barTone(percent: number, allExhausted: boolean): string {
  if (allExhausted || percent >= 90) return "bg-brand-stratus-salmon";
  if (percent >= 70) return "bg-brand-yellow";
  return "bg-brand-stratus-blue";
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
        ok ? "bg-brand-green-soft text-brand-green" : "bg-brand-pink-soft text-brand-stratus-salmon",
      )}
    >
      {label}
    </span>
  );
}

function UsageBar({ percent, exhausted }: { percent: number; exhausted: boolean }) {
  return (
    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-brand-border/60">
      <div
        className={cn("h-full rounded-full transition-all duration-500", barTone(percent, exhausted))}
        style={{ width: `${Math.max(percent, percent > 0 ? 2 : 0)}%` }}
      />
    </div>
  );
}

export function AiUsageTab() {
  const [tavily, setTavily] = useState<TavilyUsage | null>(null);
  const [llm, setLlm] = useState<LlmUsage | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAll = useCallback(async () => {
    const [tavilyRes, llmRes] = await Promise.allSettled([
      fetch("/api/usage/tavily", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/usage/llm", { cache: "no-store" }).then((r) => r.json()),
    ]);
    if (tavilyRes.status === "fulfilled") setTavily(tavilyRes.value as TavilyUsage);
    if (llmRes.status === "fulfilled") setLlm(llmRes.value as LlmUsage);
  }, []);

  useEffect(() => {
    void fetchAll();
    const id = window.setInterval(() => void fetchAll(), 120_000);
    const onRefresh = () => void fetchAll();
    window.addEventListener("tavily-usage-refresh", onRefresh);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("tavily-usage-refresh", onRefresh);
    };
  }, [fetchAll]);

  async function handleRefresh() {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  }

  return (
    <div className="pb-6">
      <div className="mb-3 flex justify-end">
        <button
          type="button"
          onClick={handleRefresh}
          className="inline-flex items-center gap-1.5 rounded-full border border-brand-stratus-blue/25 bg-white/80 px-3 py-1.5 text-[11px] font-semibold text-brand-ink-soft hover:text-brand-ink"
        >
          <RefreshCw className={cn("size-3", refreshing && "animate-spin")} />
          Refresh
        </button>
      </div>

      <SettingsGroup title="Tavily" className="mb-4">
        <SettingsRow className="justify-between py-2.5">
          <div className="flex items-center gap-2">
            {!tavily ? (
              <span className="text-[12px] text-brand-ink-faint">Loading…</span>
            ) : tavily.configured ? (
              <StatusPill ok={!tavily.allKeysExhausted} label={tavily.allKeysExhausted ? "Exhausted" : "Ready"} />
            ) : (
              <StatusPill ok={false} label="Not configured" />
            )}
          </div>
          <a
            href="https://app.tavily.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-stratus-blue"
          >
            Dashboard <ExternalLink className="size-3" />
          </a>
        </SettingsRow>
        {tavily?.configured ? (
          <>
            <SettingsGroupDivider />
            <div className="px-4 py-3">
              <div className="flex items-center justify-between text-[12px]">
                <span className="font-medium text-brand-ink">Credits</span>
                <span className="font-semibold tabular-nums text-brand-ink">
                  {tavily.totalUsed}/{tavily.totalLimit}
                </span>
              </div>
              <UsageBar percent={tavily.percentUsed} exhausted={tavily.allKeysExhausted} />
              <p className="mt-1 text-[10px] text-brand-ink-faint">
                {tavily.totalRemaining} left
                {tavily.keyCount > 1 ? ` · ${tavily.availableKeyCount}/${tavily.keyCount} keys` : ""}
              </p>
            </div>
            {tavily.keys.map((k) => {
              const pct = k.limit ? Math.min(100, (k.used / k.limit) * 100) : 0;
              return (
                <div key={k.id}>
                  <SettingsGroupDivider />
                  <div className="px-4 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[12px] font-medium text-brand-ink">
                        {k.label}
                        {k.active ? <span className="ml-1.5 text-[10px] text-brand-stratus-blue">active</span> : null}
                      </span>
                      <span className="text-[11px] tabular-nums text-brand-ink-soft">
                        {k.fetchError ? "error" : `${k.used}/${k.limit}`}
                      </span>
                    </div>
                    <UsageBar percent={pct} exhausted={k.exhausted} />
                  </div>
                </div>
              );
            })}
          </>
        ) : tavily ? (
          <p className="px-4 pb-3 text-[12px] text-brand-ink-faint">Add TAVILY_API_KEY to enable search.</p>
        ) : null}
      </SettingsGroup>

      <SettingsGroup title="Anthropic" className="mb-4">
        <SettingsRow className="justify-between py-2.5">
          <div className="flex items-center gap-2">
            {llm ? (
              <StatusPill ok={llm.anthropic.configured} label={llm.anthropic.configured ? "Ready" : "Missing key"} />
            ) : (
              <span className="text-[12px] text-brand-ink-faint">Loading…</span>
            )}
          </div>
          <a
            href="https://console.anthropic.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-stratus-blue"
          >
            Console <ExternalLink className="size-3" />
          </a>
        </SettingsRow>
        {llm ? (
          <>
            <SettingsGroupDivider />
            <SettingsRow className="justify-between py-2.5">
              <span className="text-[12px] text-brand-ink-soft">Haiku</span>
              <code className="rounded-md bg-brand-canvas px-1.5 py-0.5 font-mono text-[10px] text-brand-ink">
                {llm.anthropic.haikuModel}
              </code>
            </SettingsRow>
            <SettingsGroupDivider />
            <SettingsRow className="justify-between py-2.5">
              <span className="text-[12px] text-brand-ink-soft">Sonnet</span>
              <code className="rounded-md bg-brand-canvas px-1.5 py-0.5 font-mono text-[10px] text-brand-ink">
                {llm.anthropic.sonnetModel}
              </code>
            </SettingsRow>
          </>
        ) : null}
      </SettingsGroup>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
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
  gemini: {
    configured: boolean;
    active: boolean;
    flashModel: string;
    flashLiteModel: string;
  };
  anthropic: {
    configured: boolean;
    active: boolean;
    haikuModel: string;
    sonnetModel: string;
    maxOutputTokens: number | null;
  };
};

function barTone(percent: number, allExhausted: boolean): string {
  if (allExhausted || percent >= 90) return "bg-red-500";
  if (percent >= 70) return "bg-amber-500";
  return "bg-emerald-500";
}

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
        ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600",
      )}
    >
      <span className={cn("size-1.5 rounded-full", ok ? "bg-emerald-500" : "bg-red-400")} />
      {label}
    </span>
  );
}

function ActiveBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-ish-black px-2 py-0.5 text-[10px] font-semibold text-white">
      <span className="size-1.5 rounded-full bg-white/70" />
      Active provider
    </span>
  );
}

function SectionCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-ish-border bg-white p-5", className)}>
      {children}
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
    const id = window.setInterval(() => void fetchAll(), 30_000);
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[15px] font-semibold text-ish-ink">AI Service Usage</h2>
          <p className="mt-0.5 text-[12px] text-ish-ink-soft">
            Live credit meters and configuration status for all AI services used by Scout.
          </p>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          className="flex items-center gap-1.5 rounded-xl border border-ish-border bg-white px-3 py-2 text-[12px] font-medium text-ish-ink-soft transition-all hover:border-ish-ink-faint hover:text-ish-ink"
        >
          <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
          Refresh
        </button>
      </div>

      {/* Tavily */}
      <SectionCard>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-[13px] font-semibold text-ish-ink">Tavily Search</h3>
              {tavily?.configured ? (
                <StatusBadge ok={!tavily.allKeysExhausted} label={tavily.allKeysExhausted ? "All keys exhausted" : "Configured"} />
              ) : (
                <StatusBadge ok={false} label="Not configured" />
              )}
            </div>
            <p className="mt-0.5 text-[11px] text-ish-ink-faint">
              Used for company discovery and lead scouting. Pulled live from Tavily account API.
            </p>
          </div>
          <a
            href="https://app.tavily.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex shrink-0 items-center gap-1 text-[11px] text-ish-ink-soft hover:text-ish-ink"
          >
            Dashboard <ExternalLink className="size-3" />
          </a>
        </div>

        {!tavily ? (
          <p className="text-[12px] text-ish-ink-faint">Loading…</p>
        ) : !tavily.configured ? (
          <p className="text-[12px] text-ish-ink-faint">
            Add <code className="rounded bg-ish-app px-1 py-0.5 font-mono text-[11px]">TAVILY_API_KEY</code> to{" "}
            <code className="rounded bg-ish-app px-1 py-0.5 font-mono text-[11px]">.env.local</code> to enable Tavily.
          </p>
        ) : (
          <>
            {/* Overall totals */}
            <div className="mb-4 rounded-xl bg-ish-app px-4 py-3">
              <div className="flex items-center justify-between text-[12px]">
                <span className="font-medium text-ish-ink">Total credits</span>
                <span className={cn("font-semibold", tavily.allKeysExhausted ? "text-red-600" : "text-ish-ink")}>
                  {tavily.totalUsed} / {tavily.totalLimit} used
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-ish-border/60">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    barTone(tavily.percentUsed, tavily.allKeysExhausted),
                  )}
                  style={{ width: `${Math.max(tavily.percentUsed, tavily.totalUsed > 0 ? 2 : 0)}%` }}
                />
              </div>
              <div className="mt-1.5 flex items-center justify-between text-[10px] text-ish-ink-faint">
                <span>{tavily.totalRemaining} remaining · session calls: {tavily.sessionUsed}</span>
                {tavily.keyCount > 1 && (
                  <span>
                    {tavily.availableKeyCount} of {tavily.keyCount} keys available
                  </span>
                )}
              </div>
            </div>

            {/* Per-key breakdown */}
            <div className="space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ish-ink-faint">
                Per-key breakdown
              </p>
              {tavily.keys.map((k) => {
                const pct = k.limit ? Math.min(100, (k.used / k.limit) * 100) : 0;
                return (
                  <div key={k.id} className="rounded-xl border border-ish-border px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] font-medium text-ish-ink">{k.label}</span>
                        {k.active && (
                          <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                            active
                          </span>
                        )}
                        {k.exhausted && (
                          <span className="rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-600">
                            exhausted
                          </span>
                        )}
                        {k.plan && (
                          <span className="rounded-full bg-ish-app px-1.5 py-0.5 text-[10px] text-ish-ink-faint">
                            {k.plan}
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-ish-ink-soft">
                        {k.fetchError ? (
                          <span className="text-red-500">fetch error</span>
                        ) : (
                          <>
                            {k.used}/{k.limit}
                            {k.sessionUsed > 0 && (
                              <span className="text-ish-ink-faint"> (+{k.sessionUsed} session)</span>
                            )}
                          </>
                        )}
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ish-border/60">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          k.exhausted ? "bg-red-400" : barTone(pct, false),
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {tavily.configIssues && tavily.configIssues.length > 0 && (
              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                <p className="text-[11px] font-semibold text-red-700">Configuration issues</p>
                {tavily.configIssues.map((issue, i) => (
                  <p key={i} className="mt-1 text-[11px] text-red-600">
                    {issue}
                  </p>
                ))}
              </div>
            )}

            <p className="mt-3 text-[10px] text-ish-ink-faint">
              To add a backup key, set{" "}
              <code className="rounded bg-ish-app px-1 font-mono">TAVILY_API_KEY_2</code> in{" "}
              <code className="rounded bg-ish-app px-1 font-mono">.env.local</code> — the app rotates
              automatically when the active key hits quota.
            </p>
          </>
        )}
      </SectionCard>

      {/* Gemini */}
      <SectionCard>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-[13px] font-semibold text-ish-ink">Google Gemini</h3>
              {llm ? (
                <>
                  {llm.gemini.active && <ActiveBadge />}
                  <StatusBadge ok={llm.gemini.configured} label={llm.gemini.configured ? "Key configured" : "Key missing"} />
                </>
              ) : null}
            </div>
            <p className="mt-0.5 text-[11px] text-ish-ink-faint">
              Used for lead extraction, enrichment parsing, and AI fallback scouting.
            </p>
          </div>
          <a
            href="https://console.cloud.google.com/apis/api/generativelanguage.googleapis.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex shrink-0 items-center gap-1 text-[11px] text-ish-ink-soft hover:text-ish-ink"
          >
            Console <ExternalLink className="size-3" />
          </a>
        </div>

        {!llm ? (
          <p className="text-[12px] text-ish-ink-faint">Loading…</p>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between rounded-xl bg-ish-app px-4 py-3">
              <div>
                <p className="text-[11px] font-medium text-ish-ink">Quality tier (flash)</p>
                <p className="text-[10px] text-ish-ink-faint">Used for structured extraction tasks</p>
              </div>
              <code className="rounded-lg border border-ish-border bg-white px-2.5 py-1 text-[11px] font-mono text-ish-ink">
                {llm.gemini.flashModel}
              </code>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-ish-app px-4 py-3">
              <div>
                <p className="text-[11px] font-medium text-ish-ink">Fast tier (flash-lite)</p>
                <p className="text-[10px] text-ish-ink-faint">Used for quick classification tasks</p>
              </div>
              <code className="rounded-lg border border-ish-border bg-white px-2.5 py-1 text-[11px] font-mono text-ish-ink">
                {llm.gemini.flashLiteModel}
              </code>
            </div>
            {!llm.gemini.configured && (
              <p className="mt-2 text-[11px] text-ish-ink-faint">
                Set{" "}
                <code className="rounded bg-ish-app px-1 font-mono">GEMINI_API_KEY</code> or{" "}
                <code className="rounded bg-ish-app px-1 font-mono">GOOGLE_GENERATIVE_AI_API_KEY</code> in{" "}
                <code className="rounded bg-ish-app px-1 font-mono">.env.local</code> to enable Gemini.
              </p>
            )}
            <p className="pt-1 text-[10px] text-ish-ink-faint">
              Live quota is managed via Google AI Studio / Cloud Console. No in-app quota tracking for Gemini.
            </p>
          </div>
        )}
      </SectionCard>

      {/* Anthropic — always visible so users know it exists */}
      <SectionCard>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-[13px] font-semibold text-ish-ink">Anthropic Claude</h3>
              {llm ? (
                <>
                  {llm.anthropic.active && <ActiveBadge />}
                  <StatusBadge ok={llm.anthropic.configured} label={llm.anthropic.configured ? "Key configured" : "Key missing"} />
                </>
              ) : null}
            </div>
            <p className="mt-0.5 text-[11px] text-ish-ink-faint">
              Alternative LLM provider. Set{" "}
              <code className="rounded bg-ish-app px-1 font-mono text-[10px]">LLM_PROVIDER=anthropic</code> to
              activate.
            </p>
          </div>
          <a
            href="https://console.anthropic.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex shrink-0 items-center gap-1 text-[11px] text-ish-ink-soft hover:text-ish-ink"
          >
            Console <ExternalLink className="size-3" />
          </a>
        </div>

        {!llm ? (
          <p className="text-[12px] text-ish-ink-faint">Loading…</p>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between rounded-xl bg-ish-app px-4 py-3">
              <div>
                <p className="text-[11px] font-medium text-ish-ink">Fast tier (haiku)</p>
                <p className="text-[10px] text-ish-ink-faint">Used for quick classification tasks</p>
              </div>
              <code className="rounded-lg border border-ish-border bg-white px-2.5 py-1 text-[11px] font-mono text-ish-ink">
                {llm.anthropic.haikuModel}
              </code>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-ish-app px-4 py-3">
              <div>
                <p className="text-[11px] font-medium text-ish-ink">Quality tier (sonnet)</p>
                <p className="text-[10px] text-ish-ink-faint">Used for structured extraction tasks</p>
              </div>
              <code className="rounded-lg border border-ish-border bg-white px-2.5 py-1 text-[11px] font-mono text-ish-ink">
                {llm.anthropic.sonnetModel}
              </code>
            </div>
            {llm.anthropic.maxOutputTokens !== null && (
              <div className="flex items-center justify-between rounded-xl bg-ish-app px-4 py-3">
                <div>
                  <p className="text-[11px] font-medium text-ish-ink">Max output tokens</p>
                  <p className="text-[10px] text-ish-ink-faint">Capped via ANTHROPIC_MAX_OUTPUT_TOKENS</p>
                </div>
                <code className="rounded-lg border border-ish-border bg-white px-2.5 py-1 text-[11px] font-mono text-ish-ink">
                  {llm.anthropic.maxOutputTokens}
                </code>
              </div>
            )}
            {!llm.anthropic.configured && (
              <p className="mt-2 text-[11px] text-ish-ink-faint">
                Set{" "}
                <code className="rounded bg-ish-app px-1 font-mono">ANTHROPIC_API_KEY</code> in{" "}
                <code className="rounded bg-ish-app px-1 font-mono">.env.local</code> to configure Claude.
              </p>
            )}
            <p className="pt-1 text-[10px] text-ish-ink-faint">
              Live token usage is managed via the Anthropic Console. No in-app quota tracking for Claude.
            </p>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

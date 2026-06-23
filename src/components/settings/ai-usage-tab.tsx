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
  openrouter: {
    configured: boolean;
    active: boolean;
    fastModel: string;
    qualityModel: string;
  };
};

function barTone(percent: number, allExhausted: boolean): string {
  if (allExhausted || percent >= 90) return "bg-ish-stratus-salmon";
  if (percent >= 70) return "bg-ish-yellow";
  return "bg-ish-stratus-blue";
}

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
        ok ? "bg-ish-stratus-blue/15 text-ish-ink" : "bg-red-50 text-red-600",
      )}
    >
      <span className={cn("size-1.5 rounded-full", ok ? "bg-ish-stratus-blue" : "bg-red-400")} />
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

function UsageBar({ percent, exhausted }: { percent: number; exhausted: boolean }) {
  return (
    <div className="mt-2 h-2 overflow-hidden rounded-full bg-ish-border/60">
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
    <>
      <div className="mb-4 flex justify-end">
        <button
          type="button"
          onClick={handleRefresh}
          className="flex items-center gap-1.5 rounded-full border border-ish-border bg-white/80 px-3 py-2 text-[12px] font-medium text-ish-ink-soft backdrop-blur-sm transition-all hover:border-ish-ink-faint hover:text-ish-ink"
        >
          <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
          Refresh
        </button>
      </div>

      <SettingsGroup
        title="Tavily Search"
        footer="Used for company discovery and lead scouting. Pulled live from Tavily account API."
      >
        <SettingsRow className="justify-between py-3">
          <div className="flex items-center gap-2">
            {tavily?.configured ? (
              <StatusBadge ok={!tavily.allKeysExhausted} label={tavily.allKeysExhausted ? "All keys exhausted" : "Configured"} />
            ) : (
              <StatusBadge ok={false} label="Not configured" />
            )}
          </div>
          <a
            href="https://app.tavily.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex shrink-0 items-center gap-1 text-[12px] text-ish-stratus-blue hover:underline"
          >
            Dashboard <ExternalLink className="size-3" />
          </a>
        </SettingsRow>

        {!tavily ? (
          <p className="px-4 py-3 text-[13px] text-ish-ink-faint">Loading…</p>
        ) : !tavily.configured ? (
          <p className="px-4 py-3 text-[13px] text-ish-ink-faint">
            Add <code className="rounded bg-ish-app px-1 py-0.5 font-mono text-[11px]">TAVILY_API_KEY</code> to{" "}
            <code className="rounded bg-ish-app px-1 py-0.5 font-mono text-[11px]">.env.local</code> to enable Tavily.
          </p>
        ) : (
          <>
            <SettingsGroupDivider />
            <div className="px-4 py-3">
              <div className="flex items-center justify-between text-[13px]">
                <span className="font-medium text-ish-ink">Total credits</span>
                <span className={cn("font-semibold", tavily.allKeysExhausted ? "text-red-600" : "text-ish-ink")}>
                  {tavily.totalUsed} / {tavily.totalLimit} used
                </span>
              </div>
              <UsageBar percent={tavily.percentUsed} exhausted={tavily.allKeysExhausted} />
              <div className="mt-1.5 flex items-center justify-between text-[11px] text-ish-ink-faint">
                <span>
                  {tavily.totalRemaining} remaining · session calls: {tavily.sessionUsed}
                </span>
                {tavily.keyCount > 1 && (
                  <span>
                    {tavily.availableKeyCount} of {tavily.keyCount} keys available
                  </span>
                )}
              </div>
            </div>

            {tavily.keys.map((k, i) => {
              const pct = k.limit ? Math.min(100, (k.used / k.limit) * 100) : 0;
              return (
                <div key={k.id}>
                  <SettingsGroupDivider />
                  <div className="px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[13px] font-medium text-ish-ink">{k.label}</span>
                        {k.active && (
                          <span className="rounded-full bg-ish-stratus-blue/15 px-1.5 py-0.5 text-[10px] font-semibold text-ish-ink">
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
                          <span className="text-red-500" title={k.fetchError}>
                            {/rate.?limit|excessive requests/i.test(k.fetchError)
                              ? "rate limited"
                              : "fetch error"}
                          </span>
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
                    <UsageBar percent={pct} exhausted={k.exhausted} />
                  </div>
                </div>
              );
            })}

            {tavily.configIssues && tavily.configIssues.length > 0 && (
              <>
                <SettingsGroupDivider />
                <div className="px-4 py-3">
                  <p className="text-[12px] font-semibold text-red-700">Configuration issues</p>
                  {tavily.configIssues.map((issue, idx) => (
                    <p key={idx} className="mt-1 text-[12px] text-red-600">
                      {issue}
                    </p>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </SettingsGroup>

      <SettingsGroup
        title="Google Gemini"
        footer="Lead extraction, enrichment parsing, and AI fallback scouting. Quota managed via Google AI Studio."
      >
        <SettingsRow className="justify-between py-3">
          <div className="flex flex-wrap items-center gap-2">
            {llm ? (
              <>
                {llm.gemini.active && <ActiveBadge />}
                <StatusBadge ok={llm.gemini.configured} label={llm.gemini.configured ? "Key configured" : "Key missing"} />
              </>
            ) : (
              <span className="text-[13px] text-ish-ink-faint">Loading…</span>
            )}
          </div>
          <a
            href="https://console.cloud.google.com/apis/api/generativelanguage.googleapis.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex shrink-0 items-center gap-1 text-[12px] text-ish-stratus-blue hover:underline"
          >
            Console <ExternalLink className="size-3" />
          </a>
        </SettingsRow>

        {llm && (
          <>
            <SettingsGroupDivider />
            <div className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-[13px] font-medium text-ish-ink">Quality tier (flash)</p>
                <p className="text-[11px] text-ish-ink-faint">Structured extraction tasks</p>
              </div>
              <code className="rounded-lg bg-ish-app px-2 py-1 font-mono text-[11px] text-ish-ink">
                {llm.gemini.flashModel}
              </code>
            </div>
            <SettingsGroupDivider />
            <div className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-[13px] font-medium text-ish-ink">Fast tier (flash-lite)</p>
                <p className="text-[11px] text-ish-ink-faint">Quick classification tasks</p>
              </div>
              <code className="rounded-lg bg-ish-app px-2 py-1 font-mono text-[11px] text-ish-ink">
                {llm.gemini.flashLiteModel}
              </code>
            </div>
            {!llm.gemini.configured && (
              <>
                <SettingsGroupDivider />
                <p className="px-4 py-3 text-[12px] text-ish-ink-faint">
                  Set <code className="rounded bg-ish-app px-1 font-mono">GEMINI_API_KEY</code> or{" "}
                  <code className="rounded bg-ish-app px-1 font-mono">GOOGLE_GENERATIVE_AI_API_KEY</code> in{" "}
                  <code className="rounded bg-ish-app px-1 font-mono">.env.local</code>.
                </p>
              </>
            )}
          </>
        )}
      </SettingsGroup>

      <SettingsGroup
        title="Anthropic Claude"
        footer="Alternative LLM. Set LLM_PROVIDER=anthropic to activate. Quota managed via Anthropic Console."
      >
        <SettingsRow className="justify-between py-3">
          <div className="flex flex-wrap items-center gap-2">
            {llm ? (
              <>
                {llm.anthropic.active && <ActiveBadge />}
                <StatusBadge ok={llm.anthropic.configured} label={llm.anthropic.configured ? "Key configured" : "Key missing"} />
              </>
            ) : (
              <span className="text-[13px] text-ish-ink-faint">Loading…</span>
            )}
          </div>
          <a
            href="https://console.anthropic.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex shrink-0 items-center gap-1 text-[12px] text-ish-stratus-blue hover:underline"
          >
            Console <ExternalLink className="size-3" />
          </a>
        </SettingsRow>

        {llm && (
          <>
            <SettingsGroupDivider />
            <div className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-[13px] font-medium text-ish-ink">Fast tier (haiku)</p>
                <p className="text-[11px] text-ish-ink-faint">Quick classification tasks</p>
              </div>
              <code className="rounded-lg bg-ish-app px-2 py-1 font-mono text-[11px] text-ish-ink">
                {llm.anthropic.haikuModel}
              </code>
            </div>
            <SettingsGroupDivider />
            <div className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-[13px] font-medium text-ish-ink">Quality tier (sonnet)</p>
                <p className="text-[11px] text-ish-ink-faint">Structured extraction tasks</p>
              </div>
              <code className="rounded-lg bg-ish-app px-2 py-1 font-mono text-[11px] text-ish-ink">
                {llm.anthropic.sonnetModel}
              </code>
            </div>
            {llm.anthropic.maxOutputTokens !== null && (
              <>
                <SettingsGroupDivider />
                <div className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-[13px] font-medium text-ish-ink">Max output tokens</p>
                    <p className="text-[11px] text-ish-ink-faint">ANTHROPIC_MAX_OUTPUT_TOKENS</p>
                  </div>
                  <code className="rounded-lg bg-ish-app px-2 py-1 font-mono text-[11px] text-ish-ink">
                    {llm.anthropic.maxOutputTokens}
                  </code>
                </div>
              </>
            )}
            {!llm.anthropic.configured && (
              <>
                <SettingsGroupDivider />
                <p className="px-4 py-3 text-[12px] text-ish-ink-faint">
                  Set <code className="rounded bg-ish-app px-1 font-mono">ANTHROPIC_API_KEY</code> in{" "}
                  <code className="rounded bg-ish-app px-1 font-mono">.env.local</code> to configure Claude.
                </p>
              </>
            )}
          </>
        )}
      </SettingsGroup>

      <SettingsGroup
        title="OpenRouter"
        footer="Multi-model LLM gateway. Set LLM_PROVIDER=openrouter to activate. Quota managed via OpenRouter dashboard."
      >
        <SettingsRow className="justify-between py-3">
          <div className="flex flex-wrap items-center gap-2">
            {llm ? (
              <>
                {llm.openrouter.active && <ActiveBadge />}
                <StatusBadge ok={llm.openrouter.configured} label={llm.openrouter.configured ? "Key configured" : "Key missing"} />
              </>
            ) : (
              <span className="text-[13px] text-ish-ink-faint">Loading…</span>
            )}
          </div>
          <a
            href="https://openrouter.ai/keys"
            target="_blank"
            rel="noopener noreferrer"
            className="flex shrink-0 items-center gap-1 text-[12px] text-ish-stratus-blue hover:underline"
          >
            Dashboard <ExternalLink className="size-3" />
          </a>
        </SettingsRow>

        {llm && (
          <>
            <SettingsGroupDivider />
            <div className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-[13px] font-medium text-ish-ink">Fast tier</p>
                <p className="text-[11px] text-ish-ink-faint">Quick classification tasks</p>
              </div>
              <code className="rounded-lg bg-ish-app px-2 py-1 font-mono text-[11px] text-ish-ink">
                {llm.openrouter.fastModel}
              </code>
            </div>
            <SettingsGroupDivider />
            <div className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-[13px] font-medium text-ish-ink">Quality tier</p>
                <p className="text-[11px] text-ish-ink-faint">Structured extraction tasks</p>
              </div>
              <code className="rounded-lg bg-ish-app px-2 py-1 font-mono text-[11px] text-ish-ink">
                {llm.openrouter.qualityModel}
              </code>
            </div>
            {!llm.openrouter.configured && (
              <>
                <SettingsGroupDivider />
                <p className="px-4 py-3 text-[12px] text-ish-ink-faint">
                  Set <code className="rounded bg-ish-app px-1 font-mono">OPENROUTER_API_KEY</code> in{" "}
                  <code className="rounded bg-ish-app px-1 font-mono">.env.local</code> to configure OpenRouter.
                </p>
              </>
            )}
          </>
        )}
      </SettingsGroup>
    </>
  );
}

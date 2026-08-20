"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { runScoutAgent } from "@/lib/api-client";
import type { DataMode } from "@/lib/enrichment/types";
import { notifyCrmRecordsChanged } from "@/lib/crm-refresh";
import { AppPageHeader } from "@/design-system";
import { CitySelector } from "@/components/scouting/city-selector";
import { IndustrySelector } from "@/components/scouting/industry-selector";
import { cn } from "@/lib/utils";
import { useAgentRuns } from "@/hooks/use-agent-runs";
import type { AgentRunItem } from "@/design-system/patterns/agent-status-bar";
import {
  AlertCircle,
  ArrowRight,
  Bot,
  Calendar,
  CheckCircle,
  Mail,
  Play,
  Radar,
  Search,
  Sparkles,
  Telescope,
} from "lucide-react";
import { toast } from "sonner";

const AGENT_KEYS: Record<string, string[]> = {
  scout: ["scout"],
  writer: ["writer"],
  researcher: ["researcher-lite", "researcher"],
  sequencer: ["sequencer"],
  reply: ["reply-writer", "reply-planner", "reply-orchestrator"],
  brand: ["gift-intel", "brand-intel"],
  occasion: ["occasion-intel"],
};

function latestRun(runs: AgentRunItem[], keys: string[]): AgentRunItem | undefined {
  return runs.find((run) => keys.includes(run.agent));
}

function runLabel(run?: AgentRunItem): { text: string; tone: "idle" | "running" | "ok" | "fail" } {
  if (!run) return { text: "No recent run", tone: "idle" };
  if (run.status === "running") return { text: "Running now", tone: "running" };
  if (run.status === "failed") return { text: run.error ? `Failed: ${run.error}` : "Failed", tone: "fail" };
  return { text: run.leadName ? `Last: ${run.leadName}` : "Last run completed", tone: "ok" };
}

export function AgentsApp() {
  const { runs } = useAgentRuns();
  const [cities, setCities] = useState<string[]>(["Bangalore"]);
  const [industries, setIndustries] = useState<string[]>([]);
  const [dataMode, setDataMode] = useState<DataMode>(
    (process.env.NEXT_PUBLIC_DEFAULT_DATA_MODE as DataMode) ?? "auto",
  );
  const [running, setRunning] = useState(false);
  const [lastResult, setLastResult] = useState<Awaited<ReturnType<typeof runScoutAgent>> | null>(null);

  const catalog = useMemo(
    () => [
      {
        key: "scout",
        title: "Scout",
        body: "Batch-discover companies and decision-makers, then enrich email on save.",
        href: "#scout-agent",
        icon: Telescope,
      },
      {
        key: "researcher",
        title: "Researcher",
        body: "Builds gifting briefs, order value, and decision-chain notes on each lead.",
        href: "/leads",
        icon: Search,
      },
      {
        key: "writer",
        title: "Writer",
        body: "Drafts occasion-aware cold sequences from research, with spam scoring.",
        href: "/email",
        icon: Sparkles,
      },
      {
        key: "sequencer",
        title: "Sequencer",
        body: "Sends Email 2 and Email 3 on cadence after Email 1 goes out.",
        href: "/email?tab=active",
        icon: Mail,
      },
      {
        key: "reply",
        title: "Reply Writer",
        body: "Classifies inbound replies and drafts the next response.",
        href: "/inbox",
        icon: Mail,
      },
      {
        key: "brand",
        title: "Brand Intelligence",
        body: "Sweeps competitor gifting and buying signals from web and social.",
        href: "/brand-intelligence",
        icon: Radar,
      },
      {
        key: "occasion",
        title: "Occasion Intel",
        body: "Finds openings, festivals, and company events to time the first pitch.",
        href: "/brand-intelligence",
        icon: Calendar,
      },
    ],
    [],
  );

  async function handleRunScout() {
    if (!cities.length) {
      toast.error("Select at least one city");
      return;
    }
    setRunning(true);
    setLastResult(null);
    try {
      const result = await runScoutAgent({ cities, industries, dataMode });
      setLastResult(result);
      toast.success(`Scout complete — ${result.leadsSaved} leads saved`);
      if (result.leadsSaved > 0) {
        notifyCrmRecordsChanged({ source: "scout_agent", savedLeads: result.leadsSaved });
      }
    } catch (e) {
      toast.error("Scout agent failed. Check API keys.");
      console.error(e);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <AppPageHeader
        icon={Bot}
        title="Agents"
        subtitle="Scout, research, write, sequence, reply, and brand intel, with last-run status."
      />
      <div className="min-w-0 flex-1 overflow-y-auto bg-transparent p-8">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 grid gap-3 sm:grid-cols-2">
          {catalog.map((item) => {
            const Icon = item.icon;
            const status = runLabel(latestRun(runs, AGENT_KEYS[item.key] ?? []));
            return (
              <Link
                key={item.key}
                href={item.href}
                className="rounded-[18px] border border-brand-border bg-white p-4 shadow-[var(--shadow-brand-sm)] hover:border-brand-ink/20"
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Icon className="size-4 text-brand-ink-soft" />
                    <h2 className="text-[14px] font-bold text-brand-ink">{item.title}</h2>
                  </div>
                  <ArrowRight className="size-3.5 text-brand-ink-faint" />
                </div>
                <p className="mb-3 text-[12px] leading-relaxed text-brand-ink-soft">{item.body}</p>
                <p
                  className={cn(
                    "text-[11px] font-semibold",
                    status.tone === "running" && "text-amber-700",
                    status.tone === "ok" && "text-brand-green",
                    status.tone === "fail" && "text-red-700",
                    status.tone === "idle" && "text-brand-ink-faint",
                  )}
                >
                  {status.text}
                </p>
              </Link>
            );
          })}
        </div>

        <div
          id="scout-agent"
          className="rounded-[20px] border border-brand-border bg-white p-6 shadow-[var(--shadow-brand-sm)]"
        >
          <h2 className="mb-1 text-[15px] font-bold text-brand-ink">Scout Agent</h2>
          <p className="mb-5 text-[12.5px] leading-relaxed text-brand-ink-soft">
            Discovers companies, finds decision-makers, and saves leads with email automatically.
            Best for batch volume. Use the Scouting wizard for hand-picked quality.
          </p>

          <div className="mb-4">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-brand-ink-faint">Cities</div>
            <CitySelector cities={cities} onCitiesChange={setCities} />
            <p className="mt-2 text-[11.5px] text-brand-ink-faint">
              Karnataka cities within ~4–5 hrs of Bangalore, plus Hosur.
            </p>
          </div>

          <div className="mb-4">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-brand-ink-faint">
              Industries (optional, leave empty for all)
            </div>
            <IndustrySelector industries={industries} onIndustriesChange={setIndustries} />
          </div>

          <div className="mb-6">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-brand-ink-faint">Data mode</div>
            <div className="flex gap-2">
              {(["free", "paid", "auto"] as DataMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setDataMode(m)}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-[12px] font-semibold capitalize",
                    dataMode === m ? "bg-brand-black text-white" : "bg-brand-app text-brand-ink-soft",
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={handleRunScout}
            disabled={running}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-black py-3 text-[13px] font-bold text-white shadow-[var(--shadow-brand)] hover:opacity-90 disabled:opacity-50"
          >
            <Play className="size-4" />
            {running ? "Scouting…" : "Run Scout Agent"}
          </button>
        </div>

        {lastResult && (
          <div className="mt-4 rounded-[20px] border border-brand-border bg-white p-6 shadow-[var(--shadow-brand-sm)]">
            <div className="mb-3 flex items-center gap-2 text-[14px] font-bold text-brand-ink">
              <CheckCircle className="size-4 text-brand-green" />
              Run complete
            </div>
            <dl className="grid grid-cols-2 gap-3 text-[13px]">
              <div>
                <dt className="text-brand-ink-faint">Run ID</dt>
                <dd className="font-mono text-[11px] text-brand-ink">{lastResult.runId.slice(0, 8)}…</dd>
              </div>
              <div>
                <dt className="text-brand-ink-faint">Companies discovered</dt>
                <dd className="font-bold text-brand-ink">{lastResult.companiesDiscovered}</dd>
              </div>
              <div>
                <dt className="text-brand-ink-faint">Leads saved</dt>
                <dd className="font-bold text-brand-green">{lastResult.leadsSaved}</dd>
              </div>
              <div>
                <dt className="text-brand-ink-faint">Skipped</dt>
                <dd className="font-bold text-brand-ink">{lastResult.leadsSkipped}</dd>
              </div>
            </dl>
            {lastResult.errors.length > 0 && (
              <div className="mt-4 rounded-xl bg-red-50 p-3">
                <div className="mb-1 flex items-center gap-1.5 text-[12px] font-semibold text-red-700">
                  <AlertCircle className="size-3.5" />
                  {lastResult.errors.length} error(s)
                </div>
                <ul className="text-[11px] text-red-600">
                  {lastResult.errors.slice(0, 5).map((err) => (
                    <li key={err}>{err}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
    </div>
  );
}

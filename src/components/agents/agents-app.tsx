"use client";

import { useState } from "react";
import { runScoutAgent } from "@/lib/api-client";
import type { DataMode } from "@/lib/enrichment/types";
import { CitySelector } from "@/components/scouting/city-selector";
import { IndustrySelector } from "@/components/scouting/industry-selector";
import { cn } from "@/lib/utils";
import { Bot, Play, CheckCircle, AlertCircle } from "lucide-react";
import { toast } from "sonner";

export function AgentsApp() {
  const [cities, setCities] = useState<string[]>(["Bangalore"]);
  const [industries, setIndustries] = useState<string[]>([]);
  const [dataMode, setDataMode] = useState<DataMode>(
    (process.env.NEXT_PUBLIC_DEFAULT_DATA_MODE as DataMode) ?? "auto",
  );
  const [running, setRunning] = useState(false);
  const [lastResult, setLastResult] = useState<Awaited<ReturnType<typeof runScoutAgent>> | null>(null);

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
    } catch (e) {
      toast.error("Scout agent failed. Check API keys.");
      console.error(e);
    } finally {
      setRunning(false);
    }
  }

  return (
        <div className="min-w-0 flex-1 overflow-y-auto bg-transparent p-8">
          <div className="mx-auto max-w-2xl">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-ish-yellow shadow-[var(--shadow-ish-yellow-sm)]">
                <Bot className="size-5 text-ish-ink" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-ish-ink">Agents</h1>
                <p className="text-[13px] text-ish-ink-soft">Automated lead discovery at volume</p>
              </div>
            </div>

            <div className="rounded-[20px] border border-ish-border bg-white p-6 shadow-[var(--shadow-ish-sm)]">
              <h2 className="mb-1 text-[15px] font-bold text-ish-ink">Scout Agent</h2>
              <p className="mb-5 text-[12.5px] leading-relaxed text-ish-ink-soft">
                Discovers companies, finds decision-makers, and saves leads with email automatically.
                Best for batch volume — use the Scouting wizard for hand-picked quality.
              </p>

              <div className="mb-4">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ish-ink-faint">Cities</div>
                <CitySelector cities={cities} onCitiesChange={setCities} />
                <p className="mt-2 text-[11.5px] text-ish-ink-faint">
                  Karnataka cities within ~4–5 hrs of Bangalore, plus Hosur.
                </p>
              </div>

              <div className="mb-4">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ish-ink-faint">
                  Industries (optional, leave empty for all)
                </div>
                <IndustrySelector industries={industries} onIndustriesChange={setIndustries} />
              </div>

              <div className="mb-6">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ish-ink-faint">Data mode</div>
                <div className="flex gap-2">
                  {(["free", "paid", "auto"] as DataMode[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setDataMode(m)}
                      className={cn(
                        "rounded-lg px-3 py-1.5 text-[12px] font-semibold capitalize",
                        dataMode === m ? "bg-ish-black text-white" : "bg-ish-app text-ish-ink-soft",
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
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-ish-black py-3 text-[13px] font-bold text-white shadow-[var(--shadow-ish)] hover:opacity-90 disabled:opacity-50"
              >
                <Play className="size-4" />
                {running ? "Scouting…" : "Run Scout Agent"}
              </button>
            </div>

            {lastResult && (
              <div className="mt-4 rounded-[20px] border border-ish-border bg-white p-6 shadow-[var(--shadow-ish-sm)]">
                <div className="mb-3 flex items-center gap-2 text-[14px] font-bold text-ish-ink">
                  <CheckCircle className="size-4 text-ish-green" />
                  Run complete
                </div>
                <dl className="grid grid-cols-2 gap-3 text-[13px]">
                  <div>
                    <dt className="text-ish-ink-faint">Run ID</dt>
                    <dd className="font-mono text-[11px] text-ish-ink">{lastResult.runId.slice(0, 8)}…</dd>
                  </div>
                  <div>
                    <dt className="text-ish-ink-faint">Companies discovered</dt>
                    <dd className="font-bold text-ish-ink">{lastResult.companiesDiscovered}</dd>
                  </div>
                  <div>
                    <dt className="text-ish-ink-faint">Leads saved</dt>
                    <dd className="font-bold text-ish-green">{lastResult.leadsSaved}</dd>
                  </div>
                  <div>
                    <dt className="text-ish-ink-faint">Skipped</dt>
                    <dd className="font-bold text-ish-ink">{lastResult.leadsSkipped}</dd>
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
  );
}

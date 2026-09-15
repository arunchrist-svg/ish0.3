"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Copy, Pause, Pencil, Play, Plus, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppPageHeader } from "@/design-system";
import { cn } from "@/lib/utils";
import {
  deleteAutopilotRun,
  fetchAutopilotEnabled,
  listAutopilotRuns,
  pauseAutopilotRun,
  resumeAutopilotRun,
  setAutopilotEnabled,
  startAutopilotRun,
  updateAutopilotRun,
  type AutopilotRunDto,
} from "@/lib/api-client";
import { AutopilotRunningLoader } from "@/components/autopilot/autopilot-running-loader";
import { AutopilotRunForm, type AutopilotRunFormValues } from "@/components/autopilot/autopilot-run-form";

type RunFilter = "all" | "running" | "ready" | "paused" | "stopped";

const STATUS_LABEL: Record<AutopilotRunDto["status"], string> = {
  queued: "Queued",
  running: "Running",
  awaiting_approval: "Ready for Email 1",
  paused: "Paused",
  failed: "Stopped",
  completed: "Sending",
};

function statusLabel(run: AutopilotRunDto) {
  if (run.status === "completed" && run.input.autoSend !== true) return "Done";
  if (run.status === "awaiting_approval" && run.input.autoSend === true) return "Sending";
  return STATUS_LABEL[run.status];
}

function isLive(run: AutopilotRunDto) {
  return run.status === "queued" || run.status === "running";
}

function canContinue(run: AutopilotRunDto) {
  return !isLive(run) && run.status !== "completed" && run.progress.leadsSaved < run.input.targetLeads;
}

function runTitle(run: AutopilotRunDto) {
  const cities = run.input.cities.slice(0, 3).join(", ") || "Run";
  const vertical = run.input.industries.slice(0, 2).join(", ");
  return vertical ? `${cities} · ${vertical}` : cities;
}

function matchesFilter(run: AutopilotRunDto, filter: RunFilter) {
  if (filter === "all") return true;
  if (filter === "running") return isLive(run);
  if (filter === "ready") return run.status === "awaiting_approval" || (run.status === "completed" && run.input.autoSend === true);
  if (filter === "paused") return run.status === "paused";
  return run.status === "failed" || (run.status === "completed" && run.input.autoSend !== true);
}

export function AutopilotApp() {
  const [runs, setRuns] = useState<AutopilotRunDto[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [filter, setFilter] = useState<RunFilter>("all");
  const [error, setError] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [killBusy, setKillBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null);
  const [formBusy, setFormBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let hasLoaded = false;
    async function load() {
      try {
        const [data, flags] = await Promise.all([listAutopilotRuns(), fetchAutopilotEnabled()]);
        if (cancelled) return;
        hasLoaded = true;
        setRuns(data.runs);
        setEnabled(flags.autopilotEnabled);
        setError(null);
        setActiveId((current) => {
          if (current && data.runs.some((run) => run.id === current)) return current;
          return data.runs.find(isLive)?.id ?? data.runs[0]?.id ?? null;
        });
      } catch (e) {
        if (!cancelled && !hasLoaded) {
          setError(e instanceof Error ? e.message : "Could not load Autopilot bots");
        }
      }
    }
    void load();
    const timer = window.setInterval(load, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  function replaceRun(next: AutopilotRunDto) {
    setRuns((current) => current.map((run) => (run.id === next.id ? next : run)));
  }

  const liveRuns = runs.filter(isLive);
  const readyRuns = runs.filter(
    (run) => run.status === "awaiting_approval" || (run.status === "completed" && run.input.autoSend === true),
  );
  const pausedRuns = runs.filter((run) => run.status === "paused");
  const stoppedRuns = runs.filter((run) => run.status === "failed" || (run.status === "completed" && run.input.autoSend !== true));
  const continuable = runs.filter(canContinue);
  const visible = useMemo(() => runs.filter((run) => matchesFilter(run, filter)), [filter, runs]);

  async function toggleKillSwitch() {
    const next = !enabled;
    setKillBusy(true);
    try {
      const saved = await setAutopilotEnabled(next);
      setEnabled(saved.autopilotEnabled);
      toast.success(saved.autopilotEnabled ? "Autopilot is on." : "Autopilot is off. No new chunks will start.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update Autopilot");
    } finally {
      setKillBusy(false);
    }
  }

  async function pauseRun(id: string) {
    setBusyId(id);
    try {
      const next = await pauseAutopilotRun(id);
      replaceRun(next.run);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not pause this bot");
    } finally {
      setBusyId(null);
    }
  }

  async function continueRun(id: string) {
    setBusyId(id);
    try {
      const next = await resumeAutopilotRun(id);
      replaceRun(next.run);
      setActiveId(id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not continue this bot");
    } finally {
      setBusyId(null);
    }
  }

  async function pauseAll() {
    if (!liveRuns.length) return;
    setBulkBusy(true);
    try {
      for (const run of liveRuns) {
        const next = await pauseAutopilotRun(run.id);
        replaceRun(next.run);
      }
      toast.success(`Paused ${liveRuns.length} running bot${liveRuns.length === 1 ? "" : "s"}.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not pause running bots");
    } finally {
      setBulkBusy(false);
    }
  }

  async function createBot(values: AutopilotRunFormValues) {
    setFormBusy(true);
    try {
      const { run } = await startAutopilotRun(values);
      setRuns((current) => [run, ...current.filter((item) => item.id !== run.id)]);
      setActiveId(run.id);
      setFormMode(null);
      toast.success(values.runNow === false ? "Bot saved. It will start at the scheduled time." : "Autopilot bot started. Email 1 will queue after drafts.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create bot");
    } finally {
      setFormBusy(false);
    }
  }

  async function saveBot(values: AutopilotRunFormValues) {
    if (!activeId) return;
    setFormBusy(true);
    try {
      const { run } = await updateAutopilotRun(activeId, values);
      replaceRun(run);
      setFormMode(null);
      toast.success("Bot updated.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update bot");
    } finally {
      setFormBusy(false);
    }
  }

  async function duplicateBot(run: AutopilotRunDto) {
    setBusyId(run.id);
    try {
      const { run: created } = await startAutopilotRun({
        cities: run.input.cities,
        industries: run.input.industries,
        businesses: run.input.businesses,
        employeeBands: run.input.employeeBands,
        seniority: run.input.seniority,
        departments: run.input.departments,
        locationScope: run.input.locationScope,
        outreachTemplate: run.input.outreachTemplate,
        schedule: run.input.schedule,
        autoSend: run.input.autoSend !== false,
        runNow: true,
      });
      setRuns((current) => [created, ...current]);
      setActiveId(created.id);
      toast.success("Duplicated. New bot started from the same city and industry.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not duplicate bot");
    } finally {
      setBusyId(null);
    }
  }

  async function removeBot(run: AutopilotRunDto) {
    if (!window.confirm(`Delete ${runTitle(run)}? Saved leads stay on the board.`)) return;
    setBusyId(run.id);
    try {
      await deleteAutopilotRun(run.id);
      setRuns((current) => current.filter((item) => item.id !== run.id));
      setActiveId((current) => (current === run.id ? null : current));
      toast.success("Bot deleted.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete bot");
    } finally {
      setBusyId(null);
    }
  }

  async function continueAll() {
    if (!continuable.length) return;
    setBulkBusy(true);
    try {
      for (const run of continuable) {
        const next = await resumeAutopilotRun(run.id);
        replaceRun(next.run);
      }
      toast.success(`Continued ${continuable.length} bot${continuable.length === 1 ? "" : "s"}.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not continue bots");
    } finally {
      setBulkBusy(false);
    }
  }

  const filters: { id: RunFilter; label: string; count: number }[] = [
    { id: "all", label: "All", count: runs.length },
    { id: "running", label: "Running", count: liveRuns.length },
    { id: "ready", label: "Ready", count: readyRuns.length },
    { id: "paused", label: "Paused", count: pausedRuns.length },
    { id: "stopped", label: "Stopped", count: stoppedRuns.length },
  ];

  return (
    <div className="ish-scout-page flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <AppPageHeader icon={Sparkles} title="Autopilot bots" />
      <div className="min-w-0 flex-1 overflow-y-auto bg-transparent px-4 py-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
          <h1 className="text-[20px] font-semibold text-brand-ink lg:hidden">Autopilot bots</h1>
          <p className="text-[13px] leading-relaxed text-brand-ink-soft">
            Build a scheduled workflow: pick a time, scout filters, template, then Autopilot queues
            Email 1. Sends still follow mailbox hours and the Outbox pause.
          </p>

          <div className="rounded-[20px] border border-brand-stratus-blue/15 bg-white/90 p-4 shadow-[var(--shadow-brand-sm)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-brand-stratus-blue">Master switch</p>
                <p className="mt-1 text-[12px] text-brand-ink-soft">
                  Off stops new scout and write chunks. Send still uses Outbox pause.
                </p>
              </div>
              <button
                type="button"
                disabled={killBusy}
                onClick={() => void toggleKillSwitch()}
                className={cn(
                  "rounded-full px-3 py-1.5 text-[11px] font-semibold",
                  enabled ? "ish-scout-cta-blue text-white" : "ish-scout-ghost text-brand-ink-soft",
                )}
              >
                {enabled ? "Autopilot on" : "Autopilot off"}
              </button>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Running" value={liveRuns.length} />
              <Stat label="Ready" value={readyRuns.length} />
              <Stat label="Paused" value={pausedRuns.length} />
              <Stat label="Stopped" value={stoppedRuns.length} />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={bulkBusy || liveRuns.length === 0}
                onClick={() => void pauseAll()}
                className="ish-scout-ghost inline-flex h-8 items-center gap-1 rounded-full px-3 text-[12px] font-semibold text-brand-ink disabled:opacity-50"
              >
                <Pause className="size-3" />
                Pause all running
              </button>
              <button
                type="button"
                disabled={bulkBusy || continuable.length === 0 || !enabled}
                onClick={() => void continueAll()}
                className="ish-scout-cta-blue inline-flex h-8 items-center gap-1 rounded-full px-3 text-[12px] font-semibold text-white disabled:opacity-50"
              >
                <Play className="size-3" />
                Continue stopped
              </button>
              <button
                type="button"
                disabled={!enabled}
                onClick={() => setFormMode("create")}
                className="ish-scout-cta-yellow inline-flex h-8 items-center gap-1 rounded-full px-3 text-[12px] font-semibold disabled:opacity-50"
              >
                <Plus className="size-3" />
                New bot
              </button>
            </div>
          </div>

          {formMode === "create" ? (
            <AutopilotRunForm
              title="New Autopilot bot"
              submitLabel="Save workflow"
              busy={formBusy}
              showRunNow
              onCancel={() => setFormMode(null)}
              onSubmit={createBot}
            />
          ) : null}
          {formMode === "edit" && activeId ? (
            <AutopilotRunForm
              title="Edit bot"
              submitLabel="Save changes"
              initial={runs.find((run) => run.id === activeId)?.input}
              busy={formBusy}
              onCancel={() => setFormMode(null)}
              onSubmit={saveBot}
            />
          ) : null}

          {error ? <p className="text-[12px] text-rose-700">{error}</p> : null}

          <div className="flex flex-wrap gap-1.5">
            {filters.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setFilter(item.id)}
                className={cn(
                  "ish-scout-filter-chip",
                  filter === item.id ? "ish-scout-chip-on" : "ish-scout-chip-off",
                )}
              >
                <span className="ish-scout-filter-chip-label">
                  {item.label} {item.count}
                </span>
              </button>
            ))}
          </div>

          {visible.length === 0 ? (
            <p className="rounded-[20px] border border-dashed border-brand-stratus-blue/25 bg-white/80 px-4 py-8 text-center text-[13px] text-brand-ink-soft">
              {runs.length === 0
                ? "No Autopilot bots yet. Tap New bot, or start one from Scouting."
                : "No bots in this filter."}
            </p>
          ) : (
            <div className="overflow-hidden rounded-[20px] border border-brand-stratus-blue/15 bg-white/90">
              {visible.map((run) => {
                const selected = run.id === activeId;
                return (
                  <div key={run.id} className="border-b border-brand-border/70 last:border-b-0">
                    <button
                      type="button"
                      onClick={() => setActiveId(run.id)}
                      className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left hover:bg-brand-app/50"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-semibold text-brand-ink">{runTitle(run)}</p>
                        <p className="mt-0.5 text-[11px] tabular-nums text-brand-ink-soft">
                          {run.progress.companiesSaved}/{run.input.targetCompanies} companies ·{" "}
                          {run.progress.leadsSaved}/{run.input.targetLeads} leads · chunk{" "}
                          {run.progress.chunkIndex + 1}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                          isLive(run) && "bg-brand-stratus-blue/10 text-brand-stratus-blue",
                          run.status === "awaiting_approval" && "bg-brand-green-soft text-brand-green",
                          run.status === "paused" && "bg-brand-canvas text-brand-ink-soft",
                          (run.status === "failed" || run.status === "completed") &&
                            "bg-brand-pink-soft text-brand-stratus-salmon",
                          run.status === "completed" && "bg-brand-canvas text-brand-ink-soft",
                        )}
                      >
                        {statusLabel(run)}
                      </span>
                    </button>
                    {selected ? (
                      <div className="space-y-3 border-t border-brand-stratus-blue/15 bg-brand-stratus-blue/5 px-4 py-3">
                        {run.error || run.progress.lastError ? (
                          <p className="text-[11px] text-brand-stratus-salmon">{run.error || run.progress.lastError}</p>
                        ) : null}
                        <div className="flex flex-wrap gap-2">
                          {isLive(run) ? (
                            <button
                              type="button"
                              disabled={busyId === run.id}
                              onClick={() => void pauseRun(run.id)}
                              className="ish-scout-ghost inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[11px] font-semibold text-brand-ink"
                            >
                              <Pause className="size-3" />
                              Pause
                            </button>
                          ) : null}
                          {canContinue(run) ? (
                            <button
                              type="button"
                              disabled={busyId === run.id || !enabled}
                              onClick={() => void continueRun(run.id)}
                              className="ish-scout-cta-blue inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[11px] font-semibold text-white disabled:opacity-50"
                            >
                              <Play className="size-3" />
                              Continue
                            </button>
                          ) : null}
                          <button
                            type="button"
                            disabled={busyId === run.id}
                            onClick={() => {
                              setActiveId(run.id);
                              setFormMode("edit");
                            }}
                            className="ish-scout-ghost inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[11px] font-semibold text-brand-ink"
                          >
                            <Pencil className="size-3" />
                            Edit
                          </button>
                          <button
                            type="button"
                            disabled={busyId === run.id || !enabled}
                            onClick={() => void duplicateBot(run)}
                            className="ish-scout-ghost inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[11px] font-semibold text-brand-ink disabled:opacity-50"
                          >
                            <Copy className="size-3" />
                            Duplicate
                          </button>
                          <button
                            type="button"
                            disabled={busyId === run.id}
                            onClick={() => void removeBot(run)}
                            className="ish-scout-ghost inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[11px] font-semibold text-brand-stratus-salmon"
                          >
                            <Trash2 className="size-3" />
                            Delete
                          </button>
                          <Link
                            href={`/leads/board?autopilotRun=${run.id}`}
                            className="ish-scout-ghost inline-flex h-7 items-center rounded-full px-2.5 text-[11px] font-semibold text-brand-ink"
                          >
                            Open board
                          </Link>
                        </div>
                        {(run.progress.attemptedNames?.length || run.progress.skipped?.length) && !isLive(run) ? (
                          <div className="rounded-xl border border-brand-border/70 bg-white px-3 py-2">
                            <p className="text-[11px] text-brand-ink-soft">
                              Tried {run.progress.attemptedNames?.length ?? run.progress.skipped?.length ?? 0}{" "}
                              companies. Saved {run.progress.companiesSaved} companies and {run.progress.leadsSaved}{" "}
                              leads.
                            </p>
                            {(run.progress.skipped ?? []).length ? (
                              <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto text-[11px] text-brand-ink">
                                {(run.progress.skipped ?? []).slice(-12).reverse().map((item) => (
                                  <li key={`${item.name}-${item.reason}`}>
                                    <span className="font-medium">{item.name}</span>
                                    <span className="text-brand-ink-soft"> · {item.reason}</span>
                                  </li>
                                ))}
                              </ul>
                            ) : null}
                          </div>
                        ) : null}
                        {isLive(run) ? (
                          <AutopilotRunningLoader
                            run={run}
                            onPause={() => void pauseRun(run.id)}
                            pausing={busyId === run.id}
                            className="min-h-[280px] py-6"
                          />
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-brand-stratus-blue/15 bg-brand-stratus-blue/5 px-3 py-2">
      <p className="text-[11px] font-semibold text-brand-ink-soft">{label}</p>
      <p className="text-[18px] font-semibold tabular-nums text-brand-ink">{value}</p>
    </div>
  );
}

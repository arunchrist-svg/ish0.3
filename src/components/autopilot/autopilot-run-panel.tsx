"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Pause, Play, Sparkles } from "lucide-react";
import {
  getAutopilotRun,
  pauseAutopilotRun,
  resumeAutopilotRun,
  type AutopilotRunDto,
} from "@/lib/api-client";

const STATUS_LABEL: Record<AutopilotRunDto["status"], string> = {
  queued: "Queued",
  running: "Agent team scouting",
  awaiting_approval: "Ready for Email 1",
  paused: "Paused",
  failed: "Stopped",
  completed: "Sending",
};

export function AutopilotRunPanel({
  runId,
  initialRun,
  onClose,
  onRunChange,
  hideAllRunsLink = false,
}: {
  runId: string;
  initialRun?: AutopilotRunDto | null;
  onClose?: () => void;
  onRunChange?: (run: AutopilotRunDto) => void;
  hideAllRunsLink?: boolean;
}) {
  const [run, setRun] = useState<AutopilotRunDto | null>(initialRun ?? null);
  const [pausing, setPausing] = useState(false);
  const [resuming, setResuming] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const next = await getAutopilotRun(runId);
        if (!cancelled) {
          setRun(next.run);
          onRunChange?.(next.run);
        }
      } catch {
        /* keep last snapshot */
      }
    }
    void poll();
    const timer = window.setInterval(poll, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [runId]);

  if (!run) {
    return (
      <div className="rounded-2xl border border-brand-border bg-white px-4 py-3 text-[12px] text-brand-ink-soft">
        <Loader2 className="mr-2 inline size-3.5 animate-spin" />
        Starting Autopilot…
      </div>
    );
  }

  const live = run.status === "queued" || run.status === "running";
  const canContinue =
    !live && run.progress.leadsSaved < run.input.targetLeads && run.status !== "completed";

  return (
    <div className="rounded-2xl border border-brand-border bg-white px-4 py-3 shadow-[var(--shadow-brand-sm)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5 text-[12px] font-semibold text-brand-ink">
            <Sparkles className="size-3.5 text-brand-stratus-blue" />
            Autopilot · {STATUS_LABEL[run.status]}
          </div>
          <p className="mt-1 text-[11px] leading-snug text-brand-ink-soft">
            {run.input.autoSend
              ? "Email 1 queues after drafts. Sends follow mailbox hours."
              : "Approve Email 1, then Send All."}
          </p>
        </div>
        {onClose ? (
          <button type="button" onClick={onClose} className="text-[11px] font-semibold text-brand-ink-soft">
            Hide
          </button>
        ) : null}
      </div>
      <p className="mt-2 text-[12px] tabular-nums text-brand-ink">
        {run.progress.companiesSaved}/{run.input.targetCompanies} companies · {run.progress.leadsSaved}/
        {run.input.targetLeads} leads · chunk {run.progress.chunkIndex + 1}
      </p>
      {run.error || run.progress.lastError ? (
        <p className="mt-1 text-[11px] text-rose-700">{run.error || run.progress.lastError}</p>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {live ? (
          <button
            type="button"
            disabled={pausing}
            onClick={async () => {
              setPausing(true);
              try {
                const next = await pauseAutopilotRun(run.id);
                setRun(next.run);
              } finally {
                setPausing(false);
              }
            }}
            className="inline-flex h-7 items-center gap-1 rounded-full border border-brand-border px-2.5 text-[11px] font-semibold text-brand-ink"
          >
            <Pause className="size-3" />
            Pause
          </button>
        ) : null}
        {canContinue ? (
          <button
            type="button"
            disabled={resuming}
            onClick={async () => {
              setResuming(true);
              try {
                const next = await resumeAutopilotRun(run.id);
                setRun(next.run);
                onRunChange?.(next.run);
              } finally {
                setResuming(false);
              }
            }}
            className="inline-flex h-7 items-center gap-1 rounded-full bg-brand-black px-2.5 text-[11px] font-semibold text-white"
          >
            <Play className="size-3" />
            {resuming ? "Continuing…" : "Continue to 100 leads"}
          </button>
        ) : null}
        <Link
          href={`/leads/board?autopilotRun=${run.id}`}
          className={`inline-flex h-7 items-center rounded-full px-2.5 text-[11px] font-semibold ${
            canContinue
              ? "border border-brand-border text-brand-ink"
              : "bg-brand-black text-white"
          }`}
        >
          Review board
        </Link>
        {hideAllRunsLink ? null : (
          <Link href="/autopilot" className="text-[11px] font-semibold text-brand-stratus-blue">
            All bots
          </Link>
        )}
      </div>
    </div>
  );
}

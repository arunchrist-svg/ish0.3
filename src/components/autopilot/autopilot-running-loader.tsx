"use client";

import { useEffect, useMemo, useState } from "react";
import { Pause, Radar, Rocket } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AutopilotRunDto } from "@/lib/api-client";

type Props = {
  run?: AutopilotRunDto | null;
  cities?: string[];
  industries?: string[];
  onPause?: () => void;
  pausing?: boolean;
  className?: string;
};

function phaseCopy(run: AutopilotRunDto | null | undefined): string {
  if (!run || run.status === "queued") return "Starting the Scout agent team";
  if (run.progress.companiesSaved === 0 && run.progress.leadsSaved === 0) {
    return "Agent team is finding companies";
  }
  if (run.progress.leadsSaved < run.progress.companiesSaved) {
    return "Agent team is finding people";
  }
  return "Agent team is saving leads and writing drafts";
}

export function AutopilotRunningLoader({
  run,
  cities,
  industries,
  onPause,
  pausing = false,
  className,
}: Props) {
  const [hintIndex, setHintIndex] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);

  const place = (run?.input.cities ?? cities ?? []).filter(Boolean).slice(0, 2).join(", ");
  const vertical = (run?.input.industries ?? industries ?? []).filter(Boolean).slice(0, 2).join(", ");
  const companiesSaved = run?.progress.companiesSaved ?? 0;
  const leadsSaved = run?.progress.leadsSaved ?? 0;
  const targetCompanies = run?.input.targetCompanies ?? 100;
  const targetLeads = run?.input.targetLeads ?? 100;
  const chunkSize = run?.input.chunkSize ?? 10;
  const chunkIndex = run?.progress.chunkIndex ?? 0;
  const totalChunks = Math.max(1, Math.ceil(targetCompanies / chunkSize));
  const latestCompanies = (run?.progress.companyNames ?? []).slice(-3).reverse();
  const latestSkip = run?.progress.skipped?.at(-1);

  const hints = useMemo(() => {
    const next = [
      "Using the Agentic Scout team, same engine as Scouting",
      place ? `Agents are scanning ${place} for plants and nearby HQ` : "Agents are scanning the city for plants and nearby HQ",
      vertical ? `Matching ${vertical} buyers from your ICP` : "Matching HR, Procurement, and Admin managers",
      "Keeping one decision-maker per company after quality gates",
      "Skipping anyone already on your board",
      "Writing festive Email 1 to 3. Autopilot will not send.",
    ];
    return next;
  }, [place, vertical]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setHintIndex((i) => (i + 1) % hints.length);
    }, 2800);
    return () => window.clearInterval(id);
  }, [hints.length]);

  useEffect(() => {
    setElapsedSec(0);
    const id = window.setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [run?.id]);

  const companyPct = Math.max(4, (companiesSaved / targetCompanies) * 100);
  const leadPct = Math.max(4, (leadsSaved / targetLeads) * 100);
  const message = phaseCopy(run);

  return (
    <div
      className={cn(
        "flex h-full min-h-[calc(100vh-220px)] flex-col items-center justify-center px-6 py-10 animate-d365-in",
        className,
      )}
      role="status"
      aria-live="polite"
      aria-label={message}
    >
      <div className="relative mb-6 flex size-[72px] items-center justify-center">
        <span className="absolute inset-0 rounded-full border border-brand-yellow/40 animate-brand-radar" />
        <span className="absolute inset-1 rounded-full border border-brand-yellow/25 animate-brand-radar [animation-delay:0.6s]" />
        <span className="absolute inset-2 rounded-full border border-brand-green/20 animate-brand-radar [animation-delay:1.2s]" />
        <div className="relative z-10 flex size-11 items-center justify-center rounded-2xl bg-brand-yellow-gradient shadow-[var(--shadow-brand-yellow-sm)] animate-brand-float">
          <Rocket className="size-5 text-brand-ink" strokeWidth={2.25} />
        </div>
        <span className="absolute inset-0 animate-brand-orbit">
          <span className="absolute left-1/2 top-0 size-1.5 -translate-x-1/2 rounded-full bg-brand-green shadow-[0_0_6px_rgba(63,190,130,0.6)]" />
        </span>
      </div>

      <p className="text-[15px] font-semibold tracking-tight text-brand-ink">
        {message}
        <span className="inline-flex w-[1.1em]">
          <span className="animate-brand-dot [animation-delay:0ms]">.</span>
          <span className="animate-brand-dot [animation-delay:180ms]">.</span>
          <span className="animate-brand-dot [animation-delay:360ms]">.</span>
        </span>
      </p>
      <p className="mt-1 text-[12px] text-brand-ink-soft">
        Chunk {chunkIndex + 1} of {totalChunks}
        {place ? ` · ${place}` : ""}
        {` · ${elapsedSec}s`}
      </p>

      <div className="mt-5 w-full max-w-[280px] space-y-3">
        <Meter label="Companies" done={companiesSaved} total={targetCompanies} pct={companyPct} />
        <Meter label="Leads" done={leadsSaved} total={targetLeads} pct={leadPct} />
      </div>

      <p
        key={hintIndex}
        className="mt-4 flex max-w-[320px] items-center justify-center gap-1.5 text-center text-[12px] text-brand-ink-faint animate-d365-in"
      >
        <Radar className="size-3 shrink-0 text-brand-green" strokeWidth={2.5} />
        {hints[hintIndex]}
      </p>

      {latestCompanies.length > 0 ? (
        <p className="mt-3 max-w-[320px] text-center text-[12px] text-brand-ink-soft">
          Saved {latestCompanies.join(", ")}
        </p>
      ) : null}
      {latestSkip ? (
        <p className="mt-1 max-w-[320px] text-center text-[11px] text-brand-ink-faint">
          Skipped {latestSkip.name}: {latestSkip.reason}
        </p>
      ) : null}

      <p className="mt-4 max-w-[300px] text-center text-[11px] leading-snug text-brand-ink-faint">
        Autopilot will not send. Approve Email 1 when drafts are ready, then Send All.
      </p>

      {onPause ? (
        <button
          type="button"
          disabled={pausing || !run?.id}
          onClick={onPause}
          className="mt-5 inline-flex items-center gap-1.5 rounded-full border border-brand-border bg-white px-4 py-1.5 text-[12.5px] font-semibold text-brand-ink shadow-[var(--shadow-brand-sm)] hover:bg-brand-app disabled:opacity-50"
        >
          <Pause className="size-3" />
          {pausing ? "Pausing…" : "Pause Autopilot"}
        </button>
      ) : null}
    </div>
  );
}

function Meter({
  label,
  done,
  total,
  pct,
}: {
  label: string;
  done: number;
  total: number;
  pct: number;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px] font-semibold text-brand-ink-soft">
        <span>{label}</span>
        <span className="tabular-nums">
          {done}/{total}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-brand-border">
        <div
          className="h-full rounded-full bg-brand-yellow-gradient transition-all duration-500 ease-out"
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
    </div>
  );
}

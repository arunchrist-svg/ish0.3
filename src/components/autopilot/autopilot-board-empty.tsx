"use client";

import Link from "next/link";
import { Play, Sparkles } from "lucide-react";
import type { AutopilotRunDto } from "@/lib/api-client";

function canContinue(run: AutopilotRunDto) {
  const live = run.status === "queued" || run.status === "running";
  return !live && run.status !== "completed" && run.progress.leadsSaved < run.input.targetLeads;
}

export function AutopilotBoardEmpty({
  run,
  onContinue,
  continuing = false,
}: {
  run: AutopilotRunDto;
  onContinue?: () => void;
  continuing?: boolean;
}) {
  const tried = run.progress.attemptedNames?.length || run.progress.skipped?.length || 0;
  const skipped = (run.progress.skipped ?? []).slice(-12).reverse();
  const live = run.status === "queued" || run.status === "running";

  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-brand-border bg-white px-5 py-8 text-center shadow-[var(--shadow-brand-sm)]">
      <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-brand-app">
        <Sparkles className="size-4 text-brand-stratus-blue" />
      </div>
      <h2 className="mt-3 text-[16px] font-semibold text-brand-ink">This bot saved 0 leads</h2>
      <p className="mt-1 text-[13px] text-brand-ink-soft">
        {live
          ? "Autopilot is searching for new companies and leads. This page will fill as they are saved."
          : tried
            ? `It tried ${tried} companies and did not save a decision-maker. Review Email 1 only shows leads from this run.`
            : "No companies were saved on this run yet. Review Email 1 only shows leads from this run."}
      </p>
      {run.error || run.progress.lastError ? (
        <p className="mt-2 text-[12px] text-rose-700">{run.error || run.progress.lastError}</p>
      ) : null}
      {skipped.length ? (
        <ul className="mt-4 max-h-48 space-y-1 overflow-y-auto rounded-xl border border-brand-border/70 bg-brand-app/40 px-3 py-2 text-left text-[12px] text-brand-ink">
          {skipped.map((item) => (
            <li key={`${item.name}-${item.reason}`}>
              <span className="font-medium">{item.name}</span>
              <span className="text-brand-ink-soft"> · {item.reason}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        <Link
          href="/autopilot"
          className="inline-flex h-8 items-center rounded-full border border-brand-border bg-white px-3 text-[12px] font-semibold text-brand-ink"
        >
          Back to Autopilot
        </Link>
        {canContinue(run) && onContinue ? (
          <button
            type="button"
            disabled={continuing}
            onClick={onContinue}
            className="inline-flex h-8 items-center gap-1 rounded-full bg-brand-black px-3 text-[12px] font-semibold text-white disabled:opacity-50"
          >
            <Play className="size-3" />
            {continuing ? "Continuing…" : "Continue"}
          </button>
        ) : null}
        <Link href="/leads/board" className="text-[12px] font-semibold text-brand-stratus-blue">
          Show all leads
        </Link>
      </div>
    </div>
  );
}

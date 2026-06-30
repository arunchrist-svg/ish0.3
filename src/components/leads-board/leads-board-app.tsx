"use client";

import { useEffect, useMemo, useState } from "react";
import { Columns3, RefreshCw, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchLeads } from "@/lib/api-client";
import type { LeadQueueItem } from "@/lib/api-client";
import {
  groupLeadsByPipelineStage,
  PIPELINE_STAGES,
} from "@/lib/pipeline-status";
import { toast } from "sonner";
import { BoardColumn } from "./board-column";
import { MobilePageLayout, SearchBar } from "@/design-system";

function matchesQuery(item: LeadQueueItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [item.name, item.company, item.title, item.city, item.status, item.action, item.emailStatus]
    .some((field) => field?.toLowerCase().includes(q));
}

export function LeadsBoardApp() {
  const [leads, setLeads] = useState<LeadQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");

  async function load(opts?: { silent?: boolean }) {
    if (!opts?.silent) setLoading(true);
    else setRefreshing(true);
    try {
      const data = await fetchLeads();
      setLeads(data);
    } catch {
      toast.error("Could not load leads");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filteredLeads = useMemo(
    () => leads.filter((item) => matchesQuery(item, search)),
    [leads, search],
  );

  const grouped = useMemo(
    () => groupLeadsByPipelineStage(filteredLeads),
    [filteredLeads],
  );

  const isEmpty = !loading && leads.length === 0;
  const noResults = !loading && leads.length > 0 && filteredLeads.length === 0;

  return (
    <MobilePageLayout
      title="Lead Board"
      subtitle="Pipeline view by status"
      largeTitle
      className="ish-board-page"
      contentClassName="flex flex-col !overflow-hidden"
    >
      <SearchBar value={search} onChange={setSearch} placeholder="Search leads" sticky className="lg:hidden" />
      <header className="ish-board-hero relative hidden shrink-0 overflow-hidden border-b border-ish-border/60 px-6 py-5 lg:block">
        <div className="ish-board-hero-stripe pointer-events-none absolute inset-x-0 top-0 h-[3px]" aria-hidden />
        <div className="relative flex flex-wrap items-center gap-4">
          <div className="flex min-w-0 flex-1 items-center gap-3.5">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-ish-yellow shadow-[var(--shadow-ish-yellow-sm)]">
              <Columns3 className="size-5 text-ish-ink" />
            </div>
            <div className="min-w-0">
              <h1 className="text-[20px] font-extrabold tracking-tight text-ish-ink">Lead Board</h1>
              <p className="text-[12.5px] text-ish-ink-soft">Pipeline view by status</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-[220px] max-w-full">
              <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-ish-ink-faint" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search leads…"
                className="w-full rounded-full border border-ish-border/70 bg-white/70 py-2 pl-9 pr-3 text-[12px] text-ish-ink outline-none backdrop-blur-sm transition-colors focus:border-[rgba(var(--ish-stratus-blue-rgb),0.45)] focus:bg-white"
              />
            </div>
            <button
              type="button"
              onClick={() => load({ silent: true })}
              disabled={refreshing}
              className="flex size-9 items-center justify-center rounded-full border border-ish-border/70 bg-white/70 text-ish-ink-soft transition-all hover:border-ish-ink/20 hover:text-ish-ink active:scale-95"
              aria-label="Refresh"
            >
              <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
            </button>
          </div>
        </div>

        {!loading && !isEmpty && (
          <div className="relative mt-4 flex flex-wrap gap-2">
            {PIPELINE_STAGES.map((stage) => (
              <span
                key={stage}
                className="rounded-full border border-ish-border/60 bg-white/60 px-2.5 py-1 text-[10.5px] font-semibold text-ish-ink-soft"
              >
                {stage}
                <span className="ml-1.5 tabular-nums text-ish-ink">{grouped[stage].length}</span>
              </span>
            ))}
          </div>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-hidden px-6 py-5">
        {loading ? (
          <BoardSkeleton />
        ) : isEmpty ? (
          <EmptyState />
        ) : noResults ? (
          <div className="flex flex-col items-center justify-center gap-2 py-20 text-center">
            <Search className="size-8 text-ish-ink-faint" />
            <div className="text-[14px] font-semibold text-ish-ink">No matches</div>
            <p className="text-[12px] text-ish-ink-soft">Try a different search term</p>
          </div>
        ) : (
          <div className="flex h-full gap-4 overflow-x-auto pb-2 scrollbar-none">
            {PIPELINE_STAGES.map((stage) => (
              <BoardColumn key={stage} stage={stage} leads={grouped[stage]} />
            ))}
          </div>
        )}
      </div>
    </MobilePageLayout>
  );
}

function BoardSkeleton() {
  return (
    <div className="flex h-full gap-4 overflow-x-auto pb-2">
      {PIPELINE_STAGES.map((stage) => (
        <div key={stage} className="flex w-[280px] shrink-0 flex-col gap-3">
          <div className="h-6 w-32 animate-pulse rounded-lg bg-ish-border/50" />
          <div className="h-[120px] animate-pulse rounded-[16px] bg-ish-border/40" />
          <div className="h-[120px] animate-pulse rounded-[16px] bg-ish-border/35" />
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="ish-board-empty flex flex-col items-center justify-center gap-3 rounded-[24px] py-24 text-center">
      <Columns3 className="size-10 text-ish-ink-faint" />
      <div className="text-[15px] font-bold text-ish-ink">No leads yet</div>
      <p className="max-w-sm text-[12.5px] text-ish-ink-soft">
        Scout prospects and save them to see leads appear across pipeline columns.
      </p>
    </div>
  );
}
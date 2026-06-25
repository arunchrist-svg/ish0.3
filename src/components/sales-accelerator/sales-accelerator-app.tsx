"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { QueuePanel } from "@/components/sales-accelerator/queue-panel";
import { RecordWorkspace } from "@/components/sales-accelerator/record-workspace";
import { fetchLeads, fetchLead } from "@/lib/api-client";
import type { LeadDetailRecord, LeadQueueItem } from "@/lib/api-client";
import { showError } from "@/lib/toast";

export function SalesAcceleratorApp() {
  const searchParams = useSearchParams();
  const leadFromUrl = searchParams.get("lead");

  const [leads, setLeads] = useState<LeadQueueItem[]>([]);
  const [activeLeadId, setActiveLeadId] = useState<string | null>(leadFromUrl);
  const [listLoading, setListLoading] = useState(true);
  const [prefetchedLead, setPrefetchedLead] = useState<LeadDetailRecord | null>(null);

  async function loadLeads(opts?: { silent?: boolean }) {
    if (!opts?.silent) setListLoading(true);
    try {
      const data = await fetchLeads();
      setLeads(data);
      if (leadFromUrl && data.some((l) => l.id === leadFromUrl)) {
        setActiveLeadId(leadFromUrl);
      } else if (data.length > 0 && !activeLeadId) {
        setActiveLeadId(data[0].id);
      }
    } catch {
      showError("Couldn't load leads", { id: "leads-load", description: "Refresh the page or check your connection." });
    } finally {
      setListLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function init() {
      setListLoading(true);
      const listPromise = fetchLeads();

      const detailPromise = leadFromUrl
        ? fetchLead(leadFromUrl).catch(() => null)
        : Promise.resolve(null);

      try {
        const [list, detail] = await Promise.all([listPromise, detailPromise]);
        if (cancelled) return;

        setLeads(list);
        if (detail) setPrefetchedLead(detail);

        const activeId =
          leadFromUrl && list.some((l) => l.id === leadFromUrl)
            ? leadFromUrl
            : list[0]?.id ?? null;
        setActiveLeadId(activeId);

        if (!detail && activeId) {
          fetchLead(activeId)
            .then((d) => {
              if (!cancelled) setPrefetchedLead(d);
            })
            .catch(() => {});
        }
      } catch {
        if (!cancelled) {
          showError("Couldn't load leads", {
            id: "leads-load",
            description: "Refresh the page or check your connection.",
          });
        }
      } finally {
        if (!cancelled) setListLoading(false);
      }
    }

    void init();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (leadFromUrl) setActiveLeadId(leadFromUrl);
  }, [leadFromUrl]);

  if (!listLoading && leads.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center text-[13px] text-ish-ink-faint">
        <div className="text-4xl">🎯</div>
        <div>
          <div className="font-semibold text-ish-ink">No leads yet</div>
          <div className="mt-1">Scout companies and save leads to see them here.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
      {listLoading && leads.length === 0 ? (
        <div className="flex h-full w-[330px] shrink-0 flex-col border-r border-white/50 ish-glass-sidebar p-[22px_18px]">
          <div className="mb-4 h-7 w-28 animate-pulse rounded-lg bg-ish-app" />
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-[72px] animate-pulse rounded-[18px] bg-ish-app" />
            ))}
          </div>
        </div>
      ) : (
        <QueuePanel
          leads={leads}
          activeId={activeLeadId ?? ""}
          onSelect={setActiveLeadId}
          onRefresh={() => loadLeads({ silent: true })}
        />
      )}
      {activeLeadId ? (
        <div key={activeLeadId} className="flex min-h-0 min-w-0 flex-1 overflow-hidden animate-ish-page-in">
          <RecordWorkspace
            leadId={activeLeadId}
            initialLead={prefetchedLead?.id === activeLeadId ? prefetchedLead : null}
            onLeadUpdated={() => loadLeads({ silent: true })}
          />
        </div>
      ) : listLoading ? (
        <div className="flex flex-1 items-center justify-center text-[13px] text-ish-ink-faint">
          <span className="mr-2 animate-spin">⟳</span> Loading leads…
        </div>
      ) : null}
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { QueuePanel } from "@/components/sales-accelerator/queue-panel";
import { RecordWorkspace } from "@/components/sales-accelerator/record-workspace";
import { fetchLeads } from "@/lib/api-client";
import type { LeadQueueItem } from "@/lib/api-client";
import { toast } from "sonner";

export function SalesAcceleratorApp() {
  const searchParams = useSearchParams();
  const leadFromUrl = searchParams.get("lead");

  const [leads, setLeads] = useState<LeadQueueItem[]>([]);
  const [activeLeadId, setActiveLeadId] = useState<string | null>(leadFromUrl);
  const [loading, setLoading] = useState(true);

  async function loadLeads(opts?: { silent?: boolean }) {
    if (!opts?.silent) setLoading(true);
    try {
      const data = await fetchLeads();
      setLeads(data);
      if (leadFromUrl && data.some((l) => l.id === leadFromUrl)) {
        setActiveLeadId(leadFromUrl);
      } else if (data.length > 0 && !activeLeadId) {
        setActiveLeadId(data[0].id);
      }
    } catch {
      toast.error("Could not load leads");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadLeads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (leadFromUrl) setActiveLeadId(leadFromUrl);
  }, [leadFromUrl]);

  return (
    <>
        {loading ? (
          <div className="flex flex-1 items-center justify-center text-[13px] text-ish-ink-faint">
            <span className="mr-2 animate-spin">⟳</span> Loading leads…
          </div>
        ) : leads.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center text-[13px] text-ish-ink-faint">
            <div className="text-4xl">🎯</div>
            <div>
              <div className="font-semibold text-ish-ink">No leads yet</div>
              <div className="mt-1">Scout companies and save leads to see them here.</div>
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
            <QueuePanel
              leads={leads}
              activeId={activeLeadId ?? ""}
              onSelect={setActiveLeadId}
            />
            {activeLeadId && (
              <div key={activeLeadId} className="flex min-h-0 min-w-0 flex-1 overflow-hidden animate-ish-page-in">
                <RecordWorkspace
                  leadId={activeLeadId}
                  onLeadUpdated={() => loadLeads({ silent: true })}
                />
              </div>
            )}
          </div>
        )}
    </>
  );
}

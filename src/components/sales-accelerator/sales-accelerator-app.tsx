"use client";

import { useState, useEffect } from "react";
import { AppShell } from "@/design-system";
import { TopBar } from "@/components/sales-accelerator/top-bar";
import { SideNav } from "@/components/sales-accelerator/side-nav";
import { QueuePanel } from "@/components/sales-accelerator/queue-panel";
import { RecordWorkspace } from "@/components/sales-accelerator/record-workspace";
import { fetchLeads } from "@/lib/api-client";
import type { LeadQueueItem } from "@/lib/api-client";
import { toast } from "sonner";

export function SalesAcceleratorApp() {
  const [leads, setLeads] = useState<LeadQueueItem[]>([]);
  const [activeLeadId, setActiveLeadId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadLeads() {
    setLoading(true);
    try {
      const data = await fetchLeads();
      setLeads(data);
      if (data.length > 0 && !activeLeadId) {
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
  }, []);

  return (
    <AppShell>
      <TopBar />
      <div className="flex">
        <SideNav />
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
          <>
            <QueuePanel
              leads={leads}
              activeId={activeLeadId ?? ""}
              onSelect={setActiveLeadId}
            />
            {activeLeadId && (
              <RecordWorkspace
                leadId={activeLeadId}
                onLeadUpdated={loadLeads}
              />
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}

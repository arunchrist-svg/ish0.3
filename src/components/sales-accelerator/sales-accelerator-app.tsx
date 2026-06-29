"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { QueuePanel } from "@/components/sales-accelerator/queue-panel";
import { RecordWorkspace } from "@/components/sales-accelerator/record-workspace";
import { createLead, deleteLead, fetchLeads, fetchLead, updateLead } from "@/lib/api-client";
import type { LeadDetailRecord, LeadQueueItem } from "@/lib/api-client";
import { showError } from "@/lib/toast";
import { toast } from "sonner";
import { usePermissions } from "@/hooks/use-permissions";
import { LeadFormModal } from "@/components/sales-accelerator/lead-form-modal";
import { Button } from "@/design-system";

function leadUrl(pathname: string, params: URLSearchParams): string {
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

function readSearchParams(): URLSearchParams {
  if (typeof window === "undefined") return new URLSearchParams();
  return new URLSearchParams(window.location.search);
}

export function SalesAcceleratorApp() {
  const { canWritePipeline } = usePermissions();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const leadFromUrl = searchParams.get("lead");

  const [leads, setLeads] = useState<LeadQueueItem[]>([]);
  const [activeLeadId, setActiveLeadId] = useState<string | null>(leadFromUrl);
  const activeLeadIdRef = useRef<string | null>(leadFromUrl);
  const [listLoading, setListLoading] = useState(true);
  const [prefetchedLead, setPrefetchedLead] = useState<LeadDetailRecord | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [editingLead, setEditingLead] = useState<LeadDetailRecord | null>(null);

  useEffect(() => {
    activeLeadIdRef.current = activeLeadId;
  }, [activeLeadId]);

  const syncLeadToUrl = useCallback(
    (leadId: string) => {
      const params = readSearchParams();
      if (params.get("lead") === leadId) return;
      params.set("lead", leadId);
      router.replace(leadUrl(pathname, params));
    },
    [pathname, router],
  );

  const selectLead = useCallback(
    async (id: string) => {
      activeLeadIdRef.current = id;
      setActiveLeadId(id);
      syncLeadToUrl(id);
      try {
        const detail = await fetchLead(id);
        setPrefetchedLead(detail);
      } catch {
        setPrefetchedLead(null);
      }
    },
    [syncLeadToUrl],
  );

  function openCreateLead() {
    setFormMode("create");
    setEditingLead(null);
    setFormOpen(true);
  }

  function openEditLead(lead: LeadDetailRecord) {
    setFormMode("edit");
    setEditingLead(lead);
    setFormOpen(true);
  }

  async function handleLeadFormSubmit(values: import("@/lib/api-client").LeadFormInput) {
    if (formMode === "create") {
      const { id } = await createLead(values);
      toast.success("Lead created");
      await refreshLeadList({ silent: true });
      await selectLead(id);
      return;
    }
    if (editingLead) {
      await updateLead(editingLead.id, values);
      toast.success("Lead updated");
      await refreshLeadList({ silent: true });
      if (activeLeadIdRef.current === editingLead.id) {
        const detail = await fetchLead(editingLead.id);
        setPrefetchedLead(detail);
        setEditingLead(detail);
      }
    }
  }

  async function handleDeleteLead(leadId: string) {
    if (!window.confirm("Delete this lead? This cannot be undone.")) return;
    try {
      await deleteLead(leadId);
      toast.success("Lead deleted");
      const remaining = leads.filter((l) => l.id !== leadId);
      setLeads(remaining);
      if (activeLeadIdRef.current === leadId) {
        const nextId = remaining[0]?.id ?? null;
        activeLeadIdRef.current = nextId;
        setActiveLeadId(nextId);
        if (nextId) {
          syncLeadToUrl(nextId);
          setPrefetchedLead(await fetchLead(nextId).catch(() => null));
        } else {
          router.replace(pathname);
          setPrefetchedLead(null);
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  }

  /** Refresh sidebar queue only. Never re-resolve the active lead from URL (avoids jumps while typing). */
  const refreshLeadList = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setListLoading(true);
    try {
      const data = await fetchLeads();
      setLeads(data);

      const current = activeLeadIdRef.current;
      if (current && !data.some((l) => l.id === current)) {
        const nextId = data[0]?.id ?? null;
        activeLeadIdRef.current = nextId;
        setActiveLeadId(nextId);
        if (nextId) {
          syncLeadToUrl(nextId);
          setPrefetchedLead(await fetchLead(nextId).catch(() => null));
        } else {
          setPrefetchedLead(null);
        }
      }
    } catch {
      showError("Couldn't load leads", { id: "leads-load", description: "Refresh the page or check your connection." });
    } finally {
      if (!opts?.silent) setListLoading(false);
    }
  }, [syncLeadToUrl]);

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
        activeLeadIdRef.current = activeId;
        setActiveLeadId(activeId);

        if (activeId && activeId !== leadFromUrl) {
          syncLeadToUrl(activeId);
        }

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
    if (!leadFromUrl) return;
    if (leadFromUrl === activeLeadIdRef.current) return;

    activeLeadIdRef.current = leadFromUrl;
    setActiveLeadId(leadFromUrl);
    fetchLead(leadFromUrl)
      .then((detail) => setPrefetchedLead(detail))
      .catch(() => setPrefetchedLead(null));
  }, [leadFromUrl]);

  if (!listLoading && leads.length === 0) {
    return (
      <>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center text-[13px] text-ish-ink-faint">
          <div className="text-4xl">🎯</div>
          <div>
            <div className="font-semibold text-ish-ink">No leads yet</div>
            <div className="mt-1">Scout companies, or add a lead manually.</div>
          </div>
          {canWritePipeline ? (
            <Button
              variant="ghost"
              className="h-auto rounded-2xl bg-ish-black px-5 py-2.5 text-[13px] font-semibold text-white hover:bg-ish-black/90"
              onClick={openCreateLead}
            >
              Add lead
            </Button>
          ) : null}
        </div>
        <LeadFormModal
          open={formOpen}
          mode={formMode}
          initial={editingLead}
          onClose={() => setFormOpen(false)}
          onSubmit={handleLeadFormSubmit}
        />
      </>
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
          onSelect={(id) => void selectLead(id)}
          onRefresh={() => refreshLeadList({ silent: true })}
          onAddLead={openCreateLead}
          canWrite={canWritePipeline}
        />
      )}
      {activeLeadId ? (
        <div key={activeLeadId} className="flex min-h-0 min-w-0 flex-1 overflow-hidden animate-ish-page-in">
          <RecordWorkspace
            leadId={activeLeadId}
            initialLead={prefetchedLead?.id === activeLeadId ? prefetchedLead : null}
            onLeadUpdated={() => refreshLeadList({ silent: true })}
            onEditLead={canWritePipeline ? openEditLead : undefined}
            onDeleteLead={canWritePipeline ? handleDeleteLead : undefined}
          />
        </div>
      ) : listLoading ? (
        <div className="flex flex-1 items-center justify-center text-[13px] text-ish-ink-faint">
          <span className="mr-2 animate-spin">⟳</span> Loading leads…
        </div>
      ) : null}
      <LeadFormModal
        open={formOpen}
        mode={formMode}
        initial={editingLead}
        onClose={() => setFormOpen(false)}
        onSubmit={handleLeadFormSubmit}
      />
    </div>
  );
}

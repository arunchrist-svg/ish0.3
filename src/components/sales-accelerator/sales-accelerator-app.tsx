"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  filterLeadsByQuery,
  LEAD_QUEUE_SORT_STORAGE_KEY,
  parseLeadQueueSort,
  QueuePanel,
  sortLeadsQueue,
  type LeadQueueSort,
} from "@/components/sales-accelerator/queue-panel";
import { LeadSwitcherRail } from "@/components/sales-accelerator/lead-switcher-rail";
import { RecordWorkspace } from "@/components/sales-accelerator/record-workspace";
import { createLead, deleteLead, fetchLeads, fetchLead, mergeLeadDuplicates, updateLead } from "@/lib/api-client";
import type { LeadDetailRecord, LeadFormInput, LeadQueueItem } from "@/lib/api-client";
import { notifyCrmRecordsChanged } from "@/lib/crm-refresh";
import { deriveQueueAction } from "@/lib/pipeline-status";
import { showError } from "@/lib/toast";
import { toast } from "sonner";
import { usePermissions } from "@/hooks/use-permissions";
import { LeadFormModal } from "@/components/sales-accelerator/lead-form-modal";
import { LeadImportModal } from "@/components/sales-accelerator/lead-import-modal";
import { LinkedInLeadModal } from "@/components/sales-accelerator/linkedin-lead-modal";
import { AppPageHeader, Button, MobileStackLayout } from "@/design-system";
import { LinkedInGlyph } from "@/components/icons/linkedin-glyph";
import { Plus, Rocket, Upload } from "lucide-react";
import { useIsMobileLayout } from "@/hooks/use-media-query";

function leadUrl(pathname: string, params: URLSearchParams): string {
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

function readSearchParams(): URLSearchParams {
  if (typeof window === "undefined") return new URLSearchParams();
  return new URLSearchParams(window.location.search);
}

function queueItemFromDetail(lead: LeadDetailRecord): LeadQueueItem {
  return {
    id: lead.id,
    name: lead.name,
    title: lead.title || "—",
    company: lead.company,
    employees: lead.employees,
    city: lead.city || "—",
    score: lead.score ?? 60,
    status: lead.status,
    action: deriveQueueAction(lead.status),
    emailStatus: lead.emailStatus || "missing",
  };
}

function ensureLeadInList(list: LeadQueueItem[], lead: LeadDetailRecord): LeadQueueItem[] {
  if (list.some((item) => item.id === lead.id)) return list;
  return [queueItemFromDetail(lead), ...list];
}

export function SalesAcceleratorApp() {
  const { canWritePipeline } = usePermissions();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const leadFromUrl = searchParams.get("lead");
  const isMobileLayout = useIsMobileLayout();

  const [leads, setLeads] = useState<LeadQueueItem[]>([]);
  const [activeLeadId, setActiveLeadId] = useState<string | null>(leadFromUrl);
  const activeLeadIdRef = useRef<string | null>(leadFromUrl);
  const [listLoading, setListLoading] = useState(true);
  const [prefetchedLead, setPrefetchedLead] = useState<LeadDetailRecord | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [editingLead, setEditingLead] = useState<LeadDetailRecord | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [linkedInOpen, setLinkedInOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState<LeadFormInput | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [queueSort, setQueueSort] = useState<LeadQueueSort>("score");
  const [mergingDuplicates, setMergingDuplicates] = useState(false);
  const listScrollRef = useRef<HTMLDivElement>(null);
  const listScrollTop = useRef(0);

  useEffect(() => {
    activeLeadIdRef.current = activeLeadId;
  }, [activeLeadId]);

  useEffect(() => {
    setQueueSort(parseLeadQueueSort(localStorage.getItem(LEAD_QUEUE_SORT_STORAGE_KEY)));
  }, []);

  function handleQueueSortChange(next: LeadQueueSort) {
    setQueueSort(next);
    localStorage.setItem(LEAD_QUEUE_SORT_STORAGE_KEY, next);
  }

  const syncLeadToUrl = useCallback(
    (leadId: string) => {
      const params = readSearchParams();
      if (params.get("lead") === leadId) return;
      params.set("lead", leadId);
      router.replace(leadUrl(pathname, params));
    },
    [pathname, router],
  );


  const clearLeadFromUrl = useCallback(() => {
    activeLeadIdRef.current = null;
    setActiveLeadId(null);
    setPrefetchedLead(null);
    router.replace(pathname);
  }, [pathname, router]);

  const selectLead = useCallback(
    (id: string) => {
      activeLeadIdRef.current = id;
      setPrefetchedLead((prev) => (prev?.id === id ? prev : null));
      setActiveLeadId(id);
      syncLeadToUrl(id);
    },
    [syncLeadToUrl],
  );

  function openCreateLead() {
    setFormMode("create");
    setEditingLead(null);
    setCreateDraft(null);
    setFormOpen(true);
  }

  function openLinkedInLead() {
    setLinkedInOpen(true);
  }

  async function handleLinkedInLeadCreated(leadId: string, existing: boolean) {
    toast.success(existing ? "Lead already in your list" : "Lead added from LinkedIn");
    notifyCrmRecordsChanged({ source: "leads_create", savedLeads: existing ? 0 : 1 });
    await refreshLeadList({ silent: true });
    await selectLead(leadId);
  }

  function handleLinkedInLeadIncomplete(partial: import("@/lib/api-client").LinkedInLeadPartialProfile) {
    toast.message("Add company to finish this lead");
    setFormMode("create");
    setEditingLead(null);
    setCreateDraft({
      name: partial.name,
      title: partial.title,
      email: partial.email,
      phone: partial.phone,
      linkedIn: partial.linkedIn,
      company: partial.company ?? "",
      city: partial.city,
    });
    setFormOpen(true);
  }

  function openEditLead(lead: LeadDetailRecord) {
    setFormMode("edit");
    setEditingLead(lead);
    setFormOpen(true);
  }

  async function handleLeadFormSubmit(values: import("@/lib/api-client").LeadFormInput) {
    if (formMode === "create") {
      const { id, existing } = await createLead(values);
      toast.success(existing ? "Lead already in your list" : "Lead created");
      notifyCrmRecordsChanged({ source: "leads_create", savedLeads: existing ? 0 : 1 });
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
      notifyCrmRecordsChanged({ source: "leads_delete" });
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


  async function handleMergeDuplicates() {
    if (mergingDuplicates) return;
    if (!window.confirm("Merge duplicate leads? We will keep the furthest-along record for each person and copy missing contact details onto it.")) {
      return;
    }
    setMergingDuplicates(true);
    try {
      const result = await mergeLeadDuplicates();
      if (result.merged === 0) {
        toast.success("No duplicates to merge");
        return;
      }
      toast.success(
        result.merged === 1 ? "Merged 1 duplicate lead" : `Merged ${result.merged} duplicate leads`,
      );
      const current = activeLeadIdRef.current;
      const remap = result.groups.find((group) => current && group.deletedIds.includes(current));
      await refreshLeadList({ silent: true });
      if (remap) {
        await selectLead(remap.keepId);
      } else if (current) {
        const detail = await fetchLead(current).catch(() => null);
        if (detail) setPrefetchedLead(detail);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not merge duplicates");
    } finally {
      setMergingDuplicates(false);
    }
  }

  /** Refresh sidebar queue only. Never re-resolve the active lead from URL (avoids jumps while typing). */
  const refreshLeadList = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setListLoading(true);
    try {
      const data = await fetchLeads();
      const current = activeLeadIdRef.current;
      if (current && !data.some((l) => l.id === current)) {
        const stillOpen = await fetchLead(current).catch(() => null);
        if (stillOpen) {
          setLeads(ensureLeadInList(data, stillOpen));
          setPrefetchedLead(stillOpen);
          return;
        }
        const nextId = isMobileLayout ? null : data[0]?.id ?? null;
        activeLeadIdRef.current = nextId;
        setActiveLeadId(nextId);
        setLeads(data);
        if (nextId) {
          syncLeadToUrl(nextId);
          setPrefetchedLead(await fetchLead(nextId).catch(() => null));
        } else {
          if (isMobileLayout) router.replace(pathname);
          setPrefetchedLead(null);
        }
        return;
      }
      setLeads(data);
    } catch {
      showError("Couldn't load leads", { id: "leads-load", description: "Refresh the page or check your connection." });
    } finally {
      if (!opts?.silent) setListLoading(false);
    }
  }, [syncLeadToUrl, isMobileLayout, pathname, router]);

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

        if (detail) {
          setPrefetchedLead(detail);
          setLeads(ensureLeadInList(list, detail));
        } else {
          setLeads(list);
        }

        const urlLeadExists =
          Boolean(detail) || Boolean(leadFromUrl && list.some((l) => l.id === leadFromUrl));
        const activeId = urlLeadExists
          ? leadFromUrl
          : isMobileLayout
            ? null
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
  }, [leadFromUrl]);

  const filteredLeads = useMemo(
    () => sortLeadsQueue(filterLeadsByQuery(leads, searchQuery), queueSort),
    [leads, searchQuery, queueSort],
  );

  const handleBackToList = useCallback(() => {
    if (listScrollRef.current) {
      listScrollTop.current = listScrollRef.current.scrollTop;
    }
    clearLeadFromUrl();
  }, [clearLeadFromUrl]);

  useEffect(() => {
    if (!activeLeadId && listScrollRef.current && listScrollTop.current > 0) {
      listScrollRef.current.scrollTop = listScrollTop.current;
    }
  }, [activeLeadId]);

  if (!listLoading && leads.length === 0) {
    return (
      <>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center text-[13px] text-brand-ink-faint">
          <div className="text-4xl">🎯</div>
          <div>
            <div className="font-semibold text-brand-ink">No leads yet</div>
            <div className="mt-1">Scout companies, add a lead, or import an Excel / CSV list.</div>
          </div>
          {canWritePipeline ? (
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button
                variant="ghost"
                className="h-auto rounded-2xl bg-brand-black px-5 py-2.5 text-[13px] font-semibold text-white hover:bg-brand-black/90"
                onClick={openCreateLead}
              >
                Add lead
              </Button>
              <Button
                variant="ghost"
                className="h-auto rounded-2xl border border-brand-border bg-white px-5 py-2.5 text-[13px] font-semibold text-brand-ink hover:bg-brand-canvas"
                onClick={() => setImportOpen(true)}
              >
                <Upload className="mr-1.5 size-3.5" />
                Import CSV / Excel
              </Button>
            </div>
          ) : null}
        </div>
        <LeadFormModal
          open={formOpen}
          mode={formMode}
          initial={editingLead}
          onClose={() => setFormOpen(false)}
          onSubmit={handleLeadFormSubmit}
        />
        <LeadImportModal
          open={importOpen}
          onClose={() => setImportOpen(false)}
          onImported={() => refreshLeadList({ silent: true })}
        />
      </>
    );
  }

  const listPane = listLoading && leads.length === 0 ? (
    <div className="flex h-full w-full min-w-0 shrink-0 flex-col overflow-hidden border-r border-white/50 ish-glass-sidebar p-4 lg:w-[330px] lg:p-[22px_18px]">
      <div className="mb-4 h-7 w-28 animate-pulse rounded-lg bg-brand-app" />
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-[72px] animate-pulse rounded-[18px] bg-brand-app" />
        ))}
      </div>
    </div>
  ) : (
    <QueuePanel
      leads={leads}
      activeId={activeLeadId ?? ""}
      onSelect={selectLead}
      onRefresh={() => refreshLeadList({ silent: true })}
      onAddLead={openCreateLead}
      onAddFromLinkedIn={openLinkedInLead}
      onImportLeads={() => setImportOpen(true)}
      canWrite={canWritePipeline}
      searchQuery={searchQuery}
      onSearchQueryChange={setSearchQuery}
      listScrollRef={listScrollRef}
      sort={queueSort}
      onSortChange={handleQueueSortChange}
      onMergeDuplicates={canWritePipeline ? handleMergeDuplicates : undefined}
      mergingDuplicates={mergingDuplicates}
    />
  );

  const detailPane = activeLeadId ? (
    <div key={activeLeadId} className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden animate-brand-page-in">
      <div className="shrink-0 lg:hidden">
          <LeadSwitcherRail
            leads={filteredLeads}
            activeId={activeLeadId}
            onSelect={selectLead}
            onBack={handleBackToList}
          />
        </div>
      <RecordWorkspace
        leadId={activeLeadId}
        initialLead={prefetchedLead?.id === activeLeadId ? prefetchedLead : null}
        onLeadUpdated={() => refreshLeadList({ silent: true })}
        onEditLead={canWritePipeline ? openEditLead : undefined}
        onDeleteLead={canWritePipeline ? handleDeleteLead : undefined}
      />
    </div>
  ) : listLoading ? (
    <div className="flex flex-1 items-center justify-center text-[13px] text-brand-ink-faint">
      <span className="mr-2 animate-spin">⟳</span> Loading leads…
    </div>
  ) : (
    <div className="hidden flex-1 items-center justify-center text-[13px] text-brand-ink-faint lg:flex">
      Select a lead
    </div>
  );

  return (
    <>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <AppPageHeader
          icon={Rocket}
          title="Leads"
          subtitle="Queue and work every opportunity"
          actions={
            canWritePipeline ? (
              <>
                <button
                  type="button"
                  onClick={() => setLinkedInOpen(true)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full border border-brand-border/70 bg-white/70 px-3.5 text-[12px] font-semibold text-brand-ink transition-all hover:bg-white"
                >
                  <LinkedInGlyph className="size-3.5" />
                  LinkedIn
                </button>
                <button
                  type="button"
                  onClick={() => setImportOpen(true)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full border border-brand-border/70 bg-white/70 px-3.5 text-[12px] font-semibold text-brand-ink transition-all hover:bg-white"
                >
                  <Upload className="size-3.5" />
                  Import
                </button>
                <button
                  type="button"
                  onClick={openCreateLead}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full bg-brand-yellow px-3.5 text-[12px] font-semibold text-brand-ink shadow-[var(--shadow-brand-yellow-sm)] transition-all hover:opacity-95"
                >
                  <Plus className="size-3.5" />
                  Add lead
                </button>
              </>
            ) : null
          }
        />
        <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden lg:hidden">
          <MobileStackLayout showDetail={!!activeLeadId} list={listPane} detail={detailPane ?? <div />} onBack={handleBackToList} />
        </div>
        <div className="hidden min-h-0 min-w-0 flex-1 overflow-hidden lg:flex">
          {listPane}
          {detailPane}
        </div>
      </div>
      {canWritePipeline && !activeLeadId ? (
        <button
          type="button"
          onClick={openCreateLead}
          className="fixed bottom-[calc(84px+env(safe-area-inset-bottom))] right-4 z-30 flex size-14 items-center justify-center rounded-2xl bg-brand-stratus-blue text-white shadow-ish lg:hidden active:scale-95"
          aria-label="Add lead"
        >
          <Plus className="size-6" />
        </button>
      ) : null}
      <LeadFormModal
        open={formOpen}
        mode={formMode}
        initial={editingLead}
        createDraft={createDraft}
        onClose={() => setFormOpen(false)}
        onSubmit={handleLeadFormSubmit}
      />
      <LinkedInLeadModal
        open={linkedInOpen}
        onClose={() => setLinkedInOpen(false)}
        onCreated={handleLinkedInLeadCreated}
        onIncomplete={handleLinkedInLeadIncomplete}
      />
      <LeadImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => refreshLeadList({ silent: true })}
      />
    </>
  );
}

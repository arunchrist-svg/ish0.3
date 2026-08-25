"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/design-system";
import { RecordHeader } from "@/components/sales-accelerator/record-header";
import { PipelineStepper } from "@/components/sales-accelerator/pipeline-stepper";
import { ContactCard } from "@/components/sales-accelerator/contact-card";
import { CompanyOverviewPanel } from "@/components/company/company-overview-panel";
import { UpNextPanel } from "@/components/sales-accelerator/up-next-card";
import { LeadScoreCard } from "@/components/sales-accelerator/lead-score-card";
import { BottomCards } from "@/components/sales-accelerator/bottom-cards";
import { RelationshipAnalyticsPanel } from "@/components/network/relationship-analytics-panel";
import { EmailTabPanel } from "@/components/sales-accelerator/email-tab-panel";
import { WhatsAppTabPanel } from "@/components/sales-accelerator/whatsapp-tab-panel";
import { enrichLead, fetchLead, fetchLeadNetworkSummary } from "@/lib/api-client";
import type { LeadDetailRecord, WriterDraft } from "@/lib/api-client";
import { invalidateCached } from "@/lib/client-fetch-cache";
import { showError } from "@/lib/toast";
import { toast } from "sonner";
import { statusToPipelineIndex } from "@/lib/pipeline-status";
import { hasUsableContactEmail } from "@/lib/enrichment/contact-emails";
import { ActionLoader } from "@/components/sales-accelerator/action-loader";
import { WorkspaceLoader } from "@/components/sales-accelerator/workspace-loader";
import {
  applyWriterDraft,
  applyWriterSequence,
  mergeLeadOutreachFromServer,
} from "@/lib/email/apply-writer-draft";

type Props = {
  leadId: string;
  initialLead?: LeadDetailRecord | null;
  onLeadUpdated: () => void;
  onEditLead?: (lead: LeadDetailRecord) => void;
  onDeleteLead?: (leadId: string) => void;
};

function confidenceTierFromLead(lead: LeadDetailRecord): string {
  if (!hasUsableContactEmail(lead)) return "missing";
  if (lead.emailStatus === "generic") return "generic";
  if ((lead.emailConfidence ?? 0) >= 55) return "good";
  if ((lead.emailConfidence ?? 0) >= 40) return "generic";
  if ((lead.emailConfidence ?? 0) > 0) return "low";
  if (lead.emailStatus === "verified") return "good";
  return "low";
}

function toRecord(lead: LeadDetailRecord) {
  return {
    name: lead.name,
    leadSource: lead.leadSource,
    rating: lead.rating,
    status: lead.status,
    owner: lead.owner,
    tags: lead.tags,
    contact: {
      firstName: lead.firstName,
      lastName: lead.lastName,
      email: lead.email,
      businessPhone: lead.phone ?? "—",
      mobilePhone: lead.phone ?? "—",
      linkedIn: lead.linkedIn ?? "",
    },
    company: {
      employees: lead.employees,
      city: lead.city,
      location: `${lead.city}, India`,
    },
    upNext: lead.upNext.map((t) => ({
      title: t.title,
      step: t.step,
      desc: t.desc,
      icon: t.icon as "package" | "phone" | "file",
      active: t.active,
      primaryAction: t.primaryAction,
    })),
    score: {
      value: lead.score,
      grade: lead.scoreGrade,
      trend: lead.scoreTrend,
      factors: lead.research?.scoreFactors ?? [],
    },
    network: lead.network,
    giftingIntelligence: lead.giftingIntelligence ?? "",
  };
}

function toQueueItem(lead: LeadDetailRecord) {
  return {
    id: lead.id,
    name: lead.name,
    action: "Review",
    type: "Lead",
    date: new Date().toLocaleDateString("en-IN"),
    score: lead.score,
    icon: "mail" as const,
    company: lead.company,
    title: lead.title,
  };
}

const TABS = ["Summary", "Email", "WhatsApp", "Relationship Analytics"] as const;

const TAB_SHORT: Record<(typeof TABS)[number], string> = {
  Summary: "Summary",
  Email: "Email",
  WhatsApp: "WhatsApp",
  "Relationship Analytics": "Network",
};

export function RecordWorkspace({ leadId, initialLead, onLeadUpdated, onEditLead, onDeleteLead }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function syncTabToUrl(tab: string) {
    const params =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search)
        : new URLSearchParams(searchParams.toString());
    params.set("lead", leadId);
    if (tab === "Email") {
      params.set("tab", "email");
    } else if (tab === "WhatsApp") {
      params.set("tab", "whatsapp");
    } else {
      params.delete("tab");
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }
  const [lead, setLead] = useState<LeadDetailRecord | null>(initialLead ?? null);
  const [loading, setLoading] = useState(!initialLead);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("Summary");
  const [loadError, setLoadError] = useState<string | null>(null);

  async function load(opts?: { silent?: boolean; replaceOutreach?: boolean; clearOutreach?: boolean }) {
    if (!opts?.silent) setLoading(true);
    if (opts?.clearOutreach) {
      setLead((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          status: "researched",
          outreach: undefined,
          outreachSequence: [],
          emailThread: undefined,
        };
      });
    }
    try {
      if (opts?.replaceOutreach || opts?.clearOutreach) {
        invalidateCached(`/api/leads/${leadId}`);
      }
      const data = await fetchLead(leadId, {
        force: Boolean(opts?.replaceOutreach || opts?.clearOutreach),
      });
      setLead((prev) => {
        if (opts?.replaceOutreach || opts?.clearOutreach) return data;
        return mergeLeadOutreachFromServer(prev, data);
      });
      setLoadError(null);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to load lead";
      setLoadError(message);
      if (!opts?.silent) {
        showError("Couldn't open this lead", {
          id: `lead-load-${leadId}`,
          description: message === "Failed to fetch" ? "Check your connection and try again." : message,
        });
      }
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }

  async function refreshInline(showOverlay = true) {
    if (showOverlay) setRefreshing(true);
    try {
      await load({ silent: true, replaceOutreach: true });
    } finally {
      if (showOverlay) setRefreshing(false);
    }
  }

  async function handleRefetchEmails(mode: "free" | "paid") {
    if (!lead) return;
    try {
      const result = await enrichLead(lead.id, { mode, refetch: true });
      const found = result.enrichment.alternateEmails?.length ?? 0;
      if (result.enrichment.email && found > 0) {
        toast.success(`Found ${found + 1} email${found ? "s" : ""} for ${lead.name}`);
      } else if (result.enrichment.email) {
        toast.success(result.enrichment.message ?? "Email lookup complete");
      } else if (result.enrichment.message) {
        toast.info(result.enrichment.message);
      } else {
        toast.info(mode === "paid" ? "Paid enrich completed — no new email found" : "No new email found via free sources");
      }
      await refreshInline(false);
      onLeadUpdated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Enrichment failed");
    }
  }

  function applyDraft(draft: WriterDraft, sequence?: WriterDraft[]) {
    setLead((prev) => {
      if (!prev) return prev;
      if (sequence?.length) return applyWriterSequence(prev, sequence);
      return applyWriterDraft(prev, draft);
    });
  }


  // Always land on Summary when opening or switching leads. Ignore deep-link tab=email/whatsapp.
  useEffect(() => {
    setActiveTab("Summary");
    const params =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search)
        : new URLSearchParams(searchParams.toString());
    const tab = params.get("tab");
    if (tab === "email" || tab === "whatsapp") {
      syncTabToUrl("Summary");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId]);

  useEffect(() => {
    if (initialLead?.id === leadId) {
      setLead((prev) => {
        if (prev?.id !== leadId) return initialLead;
        return {
          ...initialLead,
          outreach: prev.outreach ?? initialLead.outreach,
          outreachSequence:
            prev.outreachSequence && prev.outreachSequence.length > 0
              ? prev.outreachSequence
              : initialLead.outreachSequence,
          emailThread:
            prev.outreachSequence && prev.outreachSequence.length > 0
              ? prev.emailThread ?? initialLead.emailThread
              : initialLead.emailThread,
          network: prev.network.length > initialLead.network.length ? prev.network : initialLead.network,
        };
      });
      setLoading(false);
      setLoadError(null);
      return;
    }
    setLead(null);
    setLoadError(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId, initialLead]);

  useEffect(() => {
    if (!lead || lead.network.length > 0) return;
    const timer = window.setTimeout(() => {
      void fetchLeadNetworkSummary(leadId)
        .then((network) => {
          if (network.length > 0) {
            setLead((prev) => (prev?.id === leadId ? { ...prev, network } : prev));
          }
        })
        .catch(() => {});
    }, 400);
    return () => window.clearTimeout(timer);
  }, [leadId, lead]);

  if (loading) {
    return (
      <WorkspaceLoader
        contactName={initialLead?.name ?? undefined}
        companyName={initialLead?.company ?? undefined}
      />
    );
  }

  if (!lead) {
    return (
      <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <div className="text-3xl">⚠️</div>
        <div className="text-[14px] font-semibold text-brand-ink">Couldn't load this lead</div>
        <p className="max-w-sm text-[12px] text-brand-ink-soft">
          {loadError ?? "Something went wrong while fetching lead details."}
        </p>
        <button
          type="button"
          onClick={() => load()}
          className="mt-1 rounded-xl bg-brand-black px-4 py-2 text-[12px] font-bold text-white"
        >
          Try again
        </button>
      </div>
    );
  }

  const record = toRecord(lead);
  const current = toQueueItem(lead);
  const hasDraft = !!lead.outreach;

  return (
    <div className="relative min-h-0 min-w-0 flex-1 overflow-y-auto p-2 lg:p-[22px_26px]">
      {refreshing && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-start justify-center bg-white/50 pt-28 backdrop-blur-[2px]">
          <ActionLoader variant="refresh" contactName={lead.name} />
        </div>
      )}
      <div className="ish-record-card overflow-hidden rounded-[22px] bg-white shadow-[var(--shadow-brand-sm)]">
        <div className="bg-brand-yellow-gradient">
          <RecordHeader current={current} lead={lead} onRefresh={refreshInline} refreshing={refreshing} onLeadUpdated={onLeadUpdated} onEditLead={onEditLead} onDeleteLead={onDeleteLead} />
          <PipelineStepper stage={statusToPipelineIndex(lead.status)} />
        </div>
        <Tabs value={activeTab} onValueChange={(tab) => { setActiveTab(tab); syncTabToUrl(tab); }} className="bg-white">
        <div className="ish-scroll-tabs overflow-x-auto border-b border-brand-border/40 px-2 py-1 lg:border-0 lg:px-4 lg:pt-2.5 lg:px-[22px]">
          <TabsList className="h-auto min-w-max gap-1 bg-transparent p-0">
            {TABS.map((tab) => (
              <TabsTrigger
                key={tab}
                value={tab}
                className="h-auto flex-none rounded-[12px] border-0 px-3 py-1.5 text-[12px] font-semibold text-brand-ink-soft shadow-none transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:text-brand-ink active:scale-[0.97] data-active:!bg-brand-black data-active:!text-white data-active:shadow-none after:hidden lg:px-3.5 lg:text-[13px]"
              >
                <span className="flex items-center gap-1.5">
                  <span className="lg:hidden">{TAB_SHORT[tab]}</span>
                  <span className="hidden lg:inline">{tab}</span>
                  {tab === "Email" && hasDraft && lead.outreach?.approvalStatus === "pending" && (
                    <span className="size-1.5 rounded-full bg-[#e8a000]" aria-label="Draft pending" />
                  )}
                  {tab === "WhatsApp" && Boolean(lead.whatsappDraft?.whatsapp) && (
                    <span className="size-1.5 rounded-full bg-[#e8a000]" aria-label="WhatsApp draft ready" />
                  )}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="Summary" className="mt-0 animate-brand-tab-in">
          <div className="grid grid-cols-1 gap-4 px-4 py-4 sm:grid-cols-2 lg:grid-cols-3 lg:px-[22px] lg:py-[18px]">
            <ContactCard
              record={record}
              current={current}
              lead={lead}
              emails={lead.emails}
              emailConfidence={lead.emailConfidence}
              confidenceTier={confidenceTierFromLead(lead)}
              enrichmentSource={lead.enrichmentSource}
              onRefetchEmails={handleRefetchEmails}
              onEmailsSaved={() => {
                void refreshInline(false);
                onLeadUpdated();
              }}
            />
            <UpNextPanel
              tasks={record.upNext}
              lead={lead}
              hasEmailDraft={hasDraft}
              onOpenEmailTab={() => { setActiveTab("Email"); syncTabToUrl("Email"); }}
              onLeadUpdated={onLeadUpdated}
              onRefresh={refreshInline}
            />
            <LeadScoreCard record={record} current={current} createdByName={lead.createdByName} />
          </div>


          <div className="px-[22px] pb-[22px]">
            <CompanyOverviewPanel
              name={lead.company}
              city={lead.city}
              industry={lead.industry}
              initialOverview={lead.companyOverview}
              decisionMakerLeadId={lead.id}
              layout="wide"
              footer={<BottomCards record={record} onOpenAnalytics={() => setActiveTab("Relationship Analytics")} />}
              overviewInput={{
                name: lead.company,
                city: lead.city,
                industry: lead.industry,
                employees: lead.employees !== "—" ? lead.employees : undefined,
                budgetBand: lead.budgetBand,
                fitScore: lead.fitScore,
                accountId: lead.accountId,
                decisionMakerHint:
                  lead.title && lead.title !== "—"
                    ? `${lead.name} — ${lead.title}`
                    : lead.name,
              }}
            />
          </div>
        </TabsContent>

        <TabsContent value="Email" className="mt-0">
          <EmailTabPanel
            lead={lead}
            draft={lead.outreach}
            onDraftUpdated={(draft, sequence) => {
              applyDraft(draft, sequence);
            }}
            onSilentRefresh={(opts) => load({ silent: true, ...opts })}
            onSent={() => {
              void load({ silent: true, replaceOutreach: true });
              onLeadUpdated();
            }}
          />
        </TabsContent>

        <TabsContent value="WhatsApp" className="mt-0">
          <WhatsAppTabPanel
            key={lead.id}
            lead={lead}
            onDraftUpdated={(draft) => {
              setLead((prev) => (prev ? { ...prev, whatsappDraft: draft } : prev));
            }}
            onSent={() => {
              load({ silent: true });
              onLeadUpdated();
            }}
          />
        </TabsContent>

        <TabsContent value="Relationship Analytics" className="mt-0 animate-brand-tab-in">
          <RelationshipAnalyticsPanel
            key={leadId}
            leadId={leadId}
            onMessageTarget={() => {
              setActiveTab("Email");
              syncTabToUrl("Email");
            }}
          />
        </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

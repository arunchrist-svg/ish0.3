"use client";

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
import { fetchLead, fetchLeadNetworkSummary } from "@/lib/api-client";
import type { LeadDetailRecord, WriterDraft } from "@/lib/api-client";
import { showError } from "@/lib/toast";
import { statusToPipelineIndex } from "@/lib/pipeline-status";
import { ActionLoader } from "@/components/sales-accelerator/action-loader";

type Props = {
  leadId: string;
  initialLead?: LeadDetailRecord | null;
  onLeadUpdated: () => void;
};

function confidenceTierFromLead(lead: LeadDetailRecord): string {
  if (!lead.email || lead.email === "—") return "missing";
  if (lead.emailStatus === "generic") return "generic";
  if ((lead.emailConfidence ?? 0) >= 55) return "good";
  if ((lead.emailConfidence ?? 0) >= 40) return "generic";
  if ((lead.emailConfidence ?? 0) > 0) return "low";
  return lead.emailStatus === "verified" || lead.emailStatus === "unverified" ? "good" : "missing";
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

const TABS = ["Summary", "Email", "Relationship Analytics", "Details", "Related"] as const;

export function RecordWorkspace({ leadId, initialLead, onLeadUpdated }: Props) {
  const [lead, setLead] = useState<LeadDetailRecord | null>(initialLead ?? null);
  const [loading, setLoading] = useState(!initialLead);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("Summary");
  const [loadError, setLoadError] = useState<string | null>(null);

  async function load(opts?: { silent?: boolean }) {
    if (!opts?.silent) setLoading(true);
    try {
      const data = await fetchLead(leadId);
      setLead(data);
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
      await load({ silent: true });
    } finally {
      if (showOverlay) setRefreshing(false);
    }
  }

  function applyDraft(draft: WriterDraft) {
    setLead((prev) =>
      prev
        ? {
            ...prev,
            status: "draft_ready",
            outreach: draft,
          }
        : prev,
    );
  }

  useEffect(() => {
    if (initialLead?.id === leadId) {
      setLead(initialLead);
      setLoading(false);
      setLoadError(null);
      return;
    }
    setLead(null);
    setLoadError(null);
    setActiveTab("Summary");
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId, initialLead]);

  useEffect(() => {
    if (!lead || lead.network.length > 0) return;
    let cancelled = false;
    void fetchLeadNetworkSummary(leadId)
      .then((network) => {
        if (!cancelled && network.length > 0) {
          setLead((prev) => (prev ? { ...prev, network } : prev));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [leadId, lead]);

  if (loading) {
    return (
      <div className="flex min-w-0 flex-1 items-center justify-center text-[13px] text-ish-ink-faint">
        <span className="mr-2 animate-spin">⟳</span> Loading…
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <div className="text-3xl">⚠️</div>
        <div className="text-[14px] font-semibold text-ish-ink">Couldn't load this lead</div>
        <p className="max-w-sm text-[12px] text-ish-ink-soft">
          {loadError ?? "Something went wrong while fetching lead details."}
        </p>
        <button
          type="button"
          onClick={() => load()}
          className="mt-1 rounded-xl bg-ish-black px-4 py-2 text-[12px] font-bold text-white"
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
    <div className="relative min-h-0 min-w-0 flex-1 overflow-y-auto p-[22px_26px]">
      {refreshing && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-start justify-center bg-white/50 pt-28 backdrop-blur-[2px]">
          <ActionLoader variant="refresh" contactName={lead.name} />
        </div>
      )}
      <div className="overflow-hidden rounded-[22px] bg-ish-yellow-gradient">
        <RecordHeader current={current} lead={lead} onRefresh={refreshInline} refreshing={refreshing} onLeadUpdated={onLeadUpdated} />
        <PipelineStepper stage={statusToPipelineIndex(lead.status)} />
      </div>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="bg-white">
        <div className="px-[22px] pt-4">
          <TabsList className="h-auto gap-1.5 bg-transparent p-0">
            {TABS.map((tab) => (
              <TabsTrigger
                key={tab}
                value={tab}
                className="h-auto flex-none rounded-[14px] border-0 px-[18px] py-2.5 text-[13px] font-semibold text-ish-ink-soft shadow-none transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:text-ish-ink active:scale-[0.97] data-active:!bg-ish-black data-active:!text-white data-active:shadow-none after:hidden"
              >
                <span className="flex items-center gap-1.5">
                  {tab}
                  {tab === "Email" && hasDraft && lead.outreach?.approvalStatus === "pending" && (
                    <span className="size-1.5 rounded-full bg-[#e8a000]" aria-label="Draft pending" />
                  )}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="Summary" className="mt-0 animate-ish-tab-in">
          <div className="grid grid-cols-3 gap-4 px-[22px] py-[18px]">
            <ContactCard
              record={record}
              current={current}
              emailConfidence={lead.emailConfidence}
              confidenceTier={confidenceTierFromLead(lead)}
              enrichmentSource={lead.enrichmentSource}
            />
            <UpNextPanel
              tasks={record.upNext}
              lead={lead}
              hasEmailDraft={hasDraft}
              onOpenEmailTab={() => setActiveTab("Email")}
              onLeadUpdated={onLeadUpdated}
              onRefresh={refreshInline}
            />
            <LeadScoreCard record={record} current={current} />
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
                giftBudget: lead.giftBudget,
                giftScore: lead.giftScore,
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
            onDraftUpdated={(draft) => {
              applyDraft(draft);
              onLeadUpdated();
            }}
            onSilentRefresh={() => load({ silent: true })}
          />
        </TabsContent>

        <TabsContent value="Relationship Analytics" className="mt-0 animate-ish-tab-in">
          <RelationshipAnalyticsPanel key={leadId} leadId={leadId} />
        </TabsContent>

        {["Details", "Related"].map((tab) => (
          <TabsContent
            key={tab}
            value={tab}
            className="px-[22px] py-12 text-center text-ish-ink-soft animate-ish-tab-in"
          >
            {tab} view coming soon.
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

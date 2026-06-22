"use client";

import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/design-system";
import { RecordToolbar } from "@/components/sales-accelerator/record-toolbar";
import { RecordHeader } from "@/components/sales-accelerator/record-header";
import { PipelineStepper } from "@/components/sales-accelerator/pipeline-stepper";
import { ContactCard } from "@/components/sales-accelerator/contact-card";
import { CompanyOverviewPanel } from "@/components/company/company-overview-panel";
import { UpNextPanel } from "@/components/sales-accelerator/up-next-card";
import { LeadScoreCard } from "@/components/sales-accelerator/lead-score-card";
import { BottomCards } from "@/components/sales-accelerator/bottom-cards";
import { EmailTabPanel } from "@/components/sales-accelerator/email-tab-panel";
import { fetchLead } from "@/lib/api-client";
import type { LeadDetailRecord } from "@/lib/api-client";
import { toast } from "sonner";
import { statusToPipelineIndex } from "@/lib/pipeline-status";

type Props = {
  leadId: string;
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

export function RecordWorkspace({ leadId, onLeadUpdated }: Props) {
  const [lead, setLead] = useState<LeadDetailRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>("Summary");

  async function load() {
    setLoading(true);
    try {
      const data = await fetchLead(leadId);
      setLead(data);
    } catch {
      toast.error("Could not load lead details");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [leadId]);

  const stage = statusToPipelineIndex(lead?.status ?? "scouted");

  if (loading) {
    return (
      <div className="flex min-w-0 flex-1 items-center justify-center text-[13px] text-ish-ink-faint">
        <span className="mr-2 animate-spin">⟳</span> Loading…
      </div>
    );
  }

  if (!lead) return null;

  const record = toRecord(lead);
  const current = toQueueItem(lead);
  const hasDraft = !!lead.outreach;

  return (
    <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-[22px_26px]">
      <RecordToolbar lead={lead} onAction={load} onLeadUpdated={onLeadUpdated} onOpenEmailTab={() => setActiveTab("Email")} hasEmailDraft={hasDraft} />
      <RecordHeader record={record} current={current} />
      <PipelineStepper stage={stage} activeDays={2} />

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
            <UpNextPanel tasks={record.upNext} />
            <LeadScoreCard record={record} current={current} />
          </div>


          <div className="px-[22px] pb-4">
            <CompanyOverviewPanel
              name={lead.company}
              city={lead.city}
              giftScore={lead.giftScore}
              industry={lead.industry}
              initialOverview={lead.companyOverview}
              decisionMakerLeadId={lead.id}
              overviewInput={{
                name: lead.company,
                city: lead.city,
                industry: lead.industry,
                employees: lead.employees !== "—" ? lead.employees : undefined,
                giftBudget: lead.giftBudget,
                giftScore: lead.giftScore,
                intelligenceNotes: lead.giftingIntelligence,
                accountId: lead.accountId,
                decisionMakerHint:
                  lead.title && lead.title !== "—"
                    ? `${lead.name} — ${lead.title}`
                    : lead.name,
              }}
            />
          </div>

          <div className="grid grid-cols-3 gap-4 px-[22px] pb-[22px]">
            <BottomCards record={record} />
          </div>
        </TabsContent>

        <TabsContent value="Email" className="mt-0">
          <EmailTabPanel
            lead={lead}
            draft={lead.outreach}
            onRefresh={() => { load(); onLeadUpdated(); }}
          />
        </TabsContent>

        {["Relationship Analytics", "Details", "Related"].map((tab) => (
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

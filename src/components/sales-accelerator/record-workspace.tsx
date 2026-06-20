"use client";

import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/design-system";
import { RecordToolbar } from "@/components/sales-accelerator/record-toolbar";
import { RecordHeader } from "@/components/sales-accelerator/record-header";
import { PipelineStepper } from "@/components/sales-accelerator/pipeline-stepper";
import { ContactCard } from "@/components/sales-accelerator/contact-card";
import { UpNextPanel } from "@/components/sales-accelerator/up-next-card";
import { LeadScoreCard } from "@/components/sales-accelerator/lead-score-card";
import { BottomCards } from "@/components/sales-accelerator/bottom-cards";
import { OutreachApprovalCard } from "@/components/sales-accelerator/outreach-approval-card";
import { fetchLead } from "@/lib/api-client";
import type { LeadDetailRecord } from "@/lib/api-client";
import { toast } from "sonner";

type Props = {
  leadId: string;
  onLeadUpdated: () => void;
};

function toRecord(lead: LeadDetailRecord) {
  return {
    name: lead.name,
    leadSource: lead.leadSource,
    rating: lead.rating,
    status: lead.status,
    owner: lead.owner,
    tags: lead.tags,
    contact: {
      topic: "Corporate Gifting — Diwali",
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

const STAGES = ["scouted", "researched", "draft_ready", "outreached", "replied", "meeting", "po_closed"];

export function RecordWorkspace({ leadId, onLeadUpdated }: Props) {
  const [lead, setLead] = useState<LeadDetailRecord | null>(null);
  const [loading, setLoading] = useState(true);

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

  const stage = Math.max(0, STAGES.indexOf(lead?.status ?? "scouted"));

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
  const hasDraft = !!lead.outreach && lead.status === "draft_ready";

  return (
    <div className="min-w-0 flex-1 overflow-hidden p-[22px_26px]">
      <RecordToolbar lead={lead} onAction={load} onLeadUpdated={onLeadUpdated} />
      <RecordHeader record={record} current={current} />
      <PipelineStepper stage={stage} activeDays={2} />

      <Tabs defaultValue="Summary" className="bg-white">
        <div className="px-[22px] pt-4">
          <TabsList className="h-auto gap-1.5 bg-transparent p-0">
            {["Summary", "Relationship Analytics", "Details", "Related"].map((tab) => (
              <TabsTrigger
                key={tab}
                value={tab}
                className="h-auto flex-none rounded-[14px] border-0 px-[18px] py-2.5 text-[13px] font-semibold text-ish-ink-soft shadow-none hover:text-ish-ink data-active:!bg-ish-black data-active:!text-white data-active:shadow-none after:hidden"
              >
                {tab}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="Summary" className="mt-0 animate-d365-in">
          <div className="grid grid-cols-3 gap-4 px-[22px] py-[18px]">
            <ContactCard record={record} current={current} />
            <UpNextPanel tasks={record.upNext} />
            <LeadScoreCard record={record} current={current} />
          </div>

          {hasDraft && lead.outreach && (
            <div className="px-[22px] pb-4">
              <OutreachApprovalCard
                leadId={lead.id}
                draft={lead.outreach}
                onDone={() => { load(); onLeadUpdated(); }}
              />
            </div>
          )}

          <div className="grid grid-cols-3 gap-4 px-[22px] pb-[22px]">
            <BottomCards record={record} />
          </div>
        </TabsContent>

        {["Relationship Analytics", "Details", "Related"].map((tab) => (
          <TabsContent
            key={tab}
            value={tab}
            className="px-[22px] py-12 text-center text-ish-ink-soft animate-d365-in"
          >
            {tab} view coming soon.
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

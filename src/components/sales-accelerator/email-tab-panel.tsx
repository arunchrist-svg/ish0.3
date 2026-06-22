"use client";

import { useEffect, useState } from "react";
import { ChevronDown, FileText, Mail, AlertCircle } from "lucide-react";
import { Button } from "@/design-system";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { runWriter } from "@/lib/api-client";
import type { LeadDetailRecord, WriterDraft } from "@/lib/api-client";
import { isContactReadyStage } from "@/lib/pipeline-status";
import { OUTREACH_TEMPLATES, getOutreachTemplate, type OutreachTemplateId } from "@/lib/email/outreach-templates";
import { WritingLoader } from "./writing-loader";
import { OutreachApprovalCard } from "./outreach-approval-card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const RUBRIC_SHORT: Record<string, string> = {
  personalisation: "Pers",
  clarity: "Clear",
  cta_strength: "CTA",
  deliverability: "Deliv",
};

type Props = {
  lead: LeadDetailRecord;
  draft?: WriterDraft;
  onDraftUpdated: (draft: WriterDraft) => void;
  onSilentRefresh: () => void;
};

export function EmailTabPanel({ lead, draft, onDraftUpdated, onSilentRefresh }: Props) {
  const [selectedTemplate, setSelectedTemplate] = useState<OutreachTemplateId>(
    (draft?.templateVariant as OutreachTemplateId) ?? OUTREACH_TEMPLATES[0].id,
  );
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (draft?.templateVariant) {
      setSelectedTemplate(draft.templateVariant as OutreachTemplateId);
    }
  }, [draft?.id, draft?.templateVariant]);

  const canWrite = isContactReadyStage(lead.status) || lead.status === "draft_ready";
  const hasDraft = !!draft;
  const activeTemplate = getOutreachTemplate(selectedTemplate);

  const verdictColor =
    draft?.deliverabilityVerdict === "PASS"
      ? "text-ish-green"
      : draft?.deliverabilityVerdict === "MARGINAL"
        ? "text-[#e8a000]"
        : "text-red-500";

  async function handleGenerate() {
    setGenerating(true);
    try {
      const newDraft = await runWriter(lead.id, { outreachTemplate: selectedTemplate });
      onDraftUpdated(newDraft);
      toast.success("Draft updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Email draft failed");
      console.error(e);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="animate-ish-tab-in px-[22px] py-[18px]">
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[12px] bg-ish-canvas px-3 py-2.5">
        <div className="flex shrink-0 items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-full bg-ish-yellow">
            <Mail className="size-3.5 text-ish-ink" />
          </div>
          <div>
            <div className="text-[13px] font-bold leading-tight text-ish-ink">Email Outreach</div>
            {hasDraft && draft ? (
              <div className="text-[10px] text-ish-ink-faint">
                {draft.draftSource} · {draft.promptVersion} · {draft.revisionCount ?? 0} rev
              </div>
            ) : (
              <div className="text-[10px] text-ish-ink-faint">No draft yet</div>
            )}
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1">
          {hasDraft && draft && !generating && (draft.rubricTotal ?? 0) > 0 ? (
            <>
              <div className="flex min-w-[90px] max-w-[140px] items-center gap-1.5">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ish-border">
                  <div
                    className="h-full rounded-full bg-ish-yellow-gradient"
                    style={{ width: `${Math.min(100, draft.rubricTotal ?? 0)}%` }}
                  />
                </div>
                <span className="shrink-0 text-[10px] font-bold text-ish-ink">{draft.rubricTotal}/100</span>
              </div>
              <div className="flex flex-wrap items-center gap-x-1.5 text-[10px] text-ish-ink-faint">
                {Object.entries(draft.rubricScore ?? {}).map(([dim, score]) => (
                  <span key={dim} className="whitespace-nowrap">
                    <span className="font-semibold text-ish-ink">{score}</span> {RUBRIC_SHORT[dim] ?? dim}
                  </span>
                ))}
              </div>
              <span className={cn("flex items-center gap-1 text-[10px] font-bold whitespace-nowrap", verdictColor)}>
                <AlertCircle className="size-3" />
                {draft.deliverabilityVerdict ?? "—"} {draft.deliverabilityScore ?? "—"}
              </span>
            </>
          ) : null}

          <DropdownMenu>
            <DropdownMenuTrigger
              disabled={!canWrite || generating}
              className={cn(
                "flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-ish-border bg-white px-2.5 text-[11px] font-semibold text-ish-ink outline-none",
                "hover:bg-ish-canvas focus-visible:ring-2 focus-visible:ring-ish-black/20 disabled:cursor-not-allowed disabled:opacity-40",
              )}
            >
              <span className="text-[9px] font-bold uppercase tracking-widest text-ish-ink-faint">Template</span>
              <span>{activeTemplate.shortLabel}</span>
              <ChevronDown className="size-3 text-ish-ink-faint" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[220px]">
              <DropdownMenuRadioGroup
                value={selectedTemplate}
                onValueChange={(v) => setSelectedTemplate(v as OutreachTemplateId)}
              >
                {OUTREACH_TEMPLATES.map((template) => (
                  <DropdownMenuRadioItem key={template.id} value={template.id} className="text-[12px]">
                    <div>
                      <div className="font-semibold">{template.label}</div>
                      <div className="text-[11px] text-ish-ink-faint">{template.description}</div>
                    </div>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="ghost"
            size="sm"
            disabled={!canWrite || generating}
            className="h-7 shrink-0 rounded-full bg-ish-black px-3 text-[11px] font-semibold text-white hover:bg-ish-black/90 disabled:opacity-40"
            onClick={handleGenerate}
          >
            <FileText className="size-3" />
            {generating ? "Writing…" : hasDraft ? "Regenerate" : "Write"}
          </Button>
        </div>
      </div>

      {generating ? (
        <div className="rounded-[20px] border border-ish-border bg-white py-12 shadow-[var(--shadow-ish-sm)]">
          <WritingLoader contactName={lead.name} companyName={lead.company} />
        </div>
      ) : hasDraft && draft ? (
        <OutreachApprovalCard key={draft.id} leadId={lead.id} draft={draft} onDone={onSilentRefresh} />
      ) : (
        <div className="flex min-h-[200px] flex-col items-center justify-center rounded-[20px] border border-dashed border-ish-border bg-white p-8 text-center shadow-[var(--shadow-ish-sm)]">
          <p className="text-[13px] font-semibold text-ish-ink">Pick {activeTemplate.shortLabel} and click Write</p>
          <p className="mt-1 max-w-sm text-[12px] text-ish-ink-soft">
            Your personalised draft will appear below for review and approval.
          </p>
        </div>
      )}
    </div>
  );
}

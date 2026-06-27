"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, FileText } from "lucide-react";
import { Button } from "@/design-system";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { runWriterSequence, runReplyWriter, updateLeadStatus } from "@/lib/api-client";
import { scoreSpamMeter } from "@/lib/agents/writer-scoring";
import type { LeadDetailRecord, WriterDraft } from "@/lib/api-client";
import { isContactReadyStage } from "@/lib/pipeline-status";
import { OUTREACH_TEMPLATES, getOutreachTemplate, type OutreachTemplateId } from "@/lib/email/outreach-templates";
import { WritingLoader } from "./writing-loader";
import { OutreachApprovalCard } from "./outreach-approval-card";
import { OutreachJourneyPanel } from "./outreach-journey-panel";
import { SpamMeter } from "./spam-meter";
import { SenderHealthMeter } from "./sender-health-meter";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Props = {
  lead: LeadDetailRecord;
  draft?: WriterDraft;
  onDraftUpdated: (draft: WriterDraft) => void;
  onSilentRefresh: () => void;
  onSent?: () => void;
};

export function EmailTabPanel({ lead, draft, onDraftUpdated, onSilentRefresh, onSent }: Props) {
  const composeRef = useRef<HTMLDivElement>(null);
  const thread = lead.emailThread;
  const sequence = lead.outreachSequence ?? [];

  const [selectedNodeId, setSelectedNodeId] = useState<string | undefined>(thread?.selectedNodeId);
  const [activeDraft, setActiveDraft] = useState<WriterDraft | undefined>(draft);
  const [selectedTemplate, setSelectedTemplate] = useState<OutreachTemplateId>(
    (draft?.templateVariant as OutreachTemplateId) ?? OUTREACH_TEMPLATES[0].id,
  );
  const [generating, setGenerating] = useState(false);
  const [generatingLabel, setGeneratingLabel] = useState<string | undefined>();
  const [templateMenuOpen, setTemplateMenuOpen] = useState(false);
  const [draftSaving, setDraftSaving] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [draftingReply, setDraftingReply] = useState(false);

  const phase = thread?.phase ?? "compose";
  const isReplyLead = lead.status === "replied";
  const isReplyDraft = activeDraft?.templateVariant === "reply";

  useEffect(() => {
    setSelectedNodeId(thread?.selectedNodeId);
  }, [thread?.selectedNodeId, lead.id]);

  useEffect(() => {
    if (draft) setActiveDraft(draft);
  }, [draft?.id]);

  useEffect(() => {
    if (draft?.templateVariant && draft.templateVariant !== "reply") {
      setSelectedTemplate(draft.templateVariant as OutreachTemplateId);
    }
  }, [draft?.id, draft?.templateVariant]);

  const selectedNode = thread?.barNodes.find((n) => n.id === selectedNodeId);

  const resolvedDraft = useMemo(() => {
    if (selectedNode?.outreachId) {
      const fromSequence = sequence.find((d) => d.id === selectedNode.outreachId);
      if (fromSequence) return fromSequence;
      if (activeDraft?.id === selectedNode.outreachId) return activeDraft;
      if (draft?.id === selectedNode.outreachId) return draft;
    }
    return activeDraft ?? draft;
  }, [selectedNode, sequence, activeDraft, draft]);

  const contentQuality = useMemo(() => {
    if (!resolvedDraft?.emailBody) return null;
    return scoreSpamMeter(resolvedDraft.emailBody, resolvedDraft.subjectA ?? "", {
      contactFirstName: lead.firstName,
      sequencePosition: resolvedDraft.sequencePosition ?? 1,
      account: {
        name: lead.company,
        employees: lead.employees !== "—" ? lead.employees : undefined,
        industry: lead.industry,
        city: lead.city,
      },
      contact: { firstName: lead.firstName, title: lead.title },
    });
  }, [resolvedDraft?.emailBody, resolvedDraft?.subjectA, resolvedDraft?.sequencePosition, lead]);

  const canWrite = isContactReadyStage(lead.status) || lead.status === "draft_ready" || isReplyLead;
  const hasDraft = !!(resolvedDraft ?? draft ?? sequence.length);
  const activeTemplate = getOutreachTemplate(selectedTemplate);
  const showComposeZone =
    thread?.showComposeZone ??
    (hasDraft && phase !== "reply_sent" && phase !== "complete");
  const isEditableNode =
    selectedNode?.kind === "draft" ||
    selectedNode?.kind === "reply_draft" ||
    thread?.barMode === "drafts" ||
    (thread?.barMode === "reply" && isReplyDraft);
  const showRegenerate =
    canWrite &&
    !isReplyLead &&
    (phase === "compose" || thread?.barMode === "drafts" || thread?.barMode === "hidden");

  const statusSubtitle =
    generating
      ? "Writing drafts…"
      : phase === "reply_sent"
        ? "Reply sent in thread"
        : phase === "awaiting_reply"
          ? "Awaiting reply"
          : isReplyDraft
            ? "Reply draft"
            : thread?.barMode === "drafts"
              ? "3 drafts ready"
              : hasDraft
                ? "Draft ready"
                : "No draft yet";

  async function handleGenerate() {
    setGenerating(true);
    setGeneratingLabel("Draft 1 of 3");
    try {
      if (isReplyLead) {
        const newDraft = await runReplyWriter(lead.id);
        setActiveDraft(newDraft);
        onDraftUpdated(newDraft);
        setSelectedNodeId("reply");
        onSilentRefresh();
        toast.success("Reply draft updated");
        return;
      }

      const drafts = await runWriterSequence(lead.id, { outreachTemplate: selectedTemplate });
      setGeneratingLabel("Draft 3 of 3");
      const first = drafts[0];
      setActiveDraft(first);
      onDraftUpdated(first);
      setSelectedNodeId("draft-1");
      onSilentRefresh();
      toast.success("3 drafts ready");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : isReplyLead ? "Reply draft failed" : "Email draft failed");
      console.error(e);
    } finally {
      setGenerating(false);
      setGeneratingLabel(undefined);
    }
  }

  async function handleDraftReply() {
    setDraftingReply(true);
    try {
      const newDraft = await runReplyWriter(lead.id);
      setActiveDraft(newDraft);
      onDraftUpdated(newDraft);
      setSelectedNodeId("reply");
      onSilentRefresh();
      composeRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      toast.success("Reply draft ready");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Reply draft failed");
    } finally {
      setDraftingReply(false);
    }
  }

  async function handleMarkTastingSent() {
    setAdvancing(true);
    try {
      await updateLeadStatus(lead.id, { status: "tasting_sent" });
      toast.success("Marked tasting sent");
      onSilentRefresh();
      onSent?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update status");
    } finally {
      setAdvancing(false);
    }
  }

  function handleNodeSelect(nodeId: string) {
    setSelectedNodeId(nodeId);
    const node = thread?.barNodes.find((n) => n.id === nodeId);
    if (node?.outreachId) {
      const d = sequence.find((s) => s.id === node.outreachId) ?? (draft?.id === node.outreachId ? draft : undefined);
      if (d) {
        setActiveDraft(d);
        onDraftUpdated(d);
      }
    }
    if (node?.kind === "draft" || node?.kind === "reply_draft") {
      composeRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  const toolbar = (
    <>
      {resolvedDraft && showComposeZone && isEditableNode && !generating ? (
        <>
          <SpamMeter
            inboxScore={contentQuality?.inboxScore ?? resolvedDraft.inboxScore ?? resolvedDraft.deliverabilityScore}
            factors={contentQuality?.factors ?? []}
          />
          <SenderHealthMeter />
          <div className="hidden h-4 w-px shrink-0 bg-ish-border/80 sm:block" aria-hidden />
          <div className="min-w-0 truncate text-[11px] text-ish-ink-soft">
            To: <span className="font-semibold text-ish-ink">{lead.name ?? "Contact"}</span>
            {lead.company ? ` · ${lead.company}` : ""}
          </div>
        </>
      ) : null}
      <div className="ml-auto flex flex-wrap items-center gap-x-2 gap-y-1">
        {draftSaving ? <span className="shrink-0 text-[10px] text-ish-ink-faint">Saving…</span> : null}
        {!isReplyLead && showRegenerate ? (
          <DropdownMenu modal={false} open={templateMenuOpen} onOpenChange={setTemplateMenuOpen}>
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
                onValueChange={(v) => {
                  setSelectedTemplate(v as OutreachTemplateId);
                  setTemplateMenuOpen(false);
                }}
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
        ) : null}
        {showRegenerate || (isReplyLead && phase !== "reply_sent") ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!canWrite || generating}
            className="h-7 shrink-0 rounded-full bg-ish-black px-3 text-[11px] font-semibold text-white hover:bg-ish-black/90 disabled:opacity-40"
            onClick={() => void handleGenerate()}
          >
            <FileText className="size-3" />
            {generating ? "Writing…" : hasDraft ? (isReplyLead ? "Regenerate reply" : "Regenerate") : "Write"}
          </Button>
        ) : null}
        {phase === "reply_sent" ? (
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={advancing}
              className="h-7 shrink-0 rounded-full bg-ish-black px-3 text-[11px] font-semibold text-white hover:bg-ish-black/90 disabled:opacity-40"
              onClick={() => void handleMarkTastingSent()}
            >
              {advancing ? "Updating…" : "Mark tasting sent"}
            </Button>
            <Link
              href="/email"
              className="inline-flex h-7 shrink-0 items-center rounded-full border border-ish-border bg-white px-3 text-[11px] font-semibold text-ish-ink hover:bg-ish-canvas"
            >
              View in Email Outreach
            </Link>
          </>
        ) : null}
      </div>
    </>
  );

  return (
    <div className="animate-ish-tab-in px-[22px] py-[18px]">
      <OutreachJourneyPanel
        thread={thread}
        statusSubtitle={statusSubtitle}
        toolbar={toolbar}
        selectedNodeId={selectedNodeId}
        onNodeSelect={handleNodeSelect}
        onDraftReply={() => void handleDraftReply()}
        draftReplyLoading={draftingReply}
      />

      {generating ? (
        <div className="rounded-[20px] border border-ish-border bg-white py-12 shadow-[var(--shadow-ish-sm)]">
          <WritingLoader
            contactName={lead.name}
            companyName={lead.company}
            sequenceLabel={generatingLabel}
          />
        </div>
      ) : showComposeZone && isEditableNode && resolvedDraft ? (
        <div ref={composeRef}>
          <OutreachApprovalCard
            key={resolvedDraft.id}
            draft={resolvedDraft}
            leadId={lead.id}
            leadStatus={lead.status}
            contactEmail={lead.email}
            emailThread={thread}
            onDraftUpdated={(d) => {
              setActiveDraft(d);
              onDraftUpdated(d);
            }}
            onSavingChange={setDraftSaving}
            contentScore={contentQuality?.inboxScore ?? resolvedDraft.inboxScore ?? resolvedDraft.deliverabilityScore}
            onSent={onSent ?? onSilentRefresh}
          />
        </div>
      ) : (phase === "reply_sent" || phase === "complete") && isReplyLead ? (
        <div className="flex justify-end pt-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-auto rounded-full bg-ish-black px-4 py-2 text-[12px] font-semibold text-white"
            onClick={() => void handleGenerate()}
          >
            Draft another reply
          </Button>
        </div>
      ) : null}
    </div>
  );
}

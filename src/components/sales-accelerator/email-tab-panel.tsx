"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, FileText, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/design-system";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { runWriterSequence, runReplyWriter, updateLeadStatus, regenerateSequenceStep } from "@/lib/api-client";
import { scoreSpamMeter } from "@/lib/agents/writer-scoring";
import type { LeadDetailRecord, WriterDraft } from "@/lib/api-client";
import { isContactReadyStage } from "@/lib/pipeline-status";
import { OUTREACH_TEMPLATES, getOutreachTemplate, type OutreachTemplateId } from "@/lib/email/outreach-templates";
import { WritingLoader } from "./writing-loader";
import { OutreachApprovalCard } from "./outreach-approval-card";
import { OutreachJourneyPanel } from "./outreach-journey-panel";
import { SpamMeter } from "./spam-meter";
import { SenderHealthMeter } from "./sender-health-meter";
import { SequenceControlButtons } from "./sequence-control-buttons";
import { SyncRepliesButton } from "./sync-replies-button";
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

  const replyDraft = useMemo(() => {
    if (activeDraft?.templateVariant === "reply") return activeDraft;
    if (draft?.templateVariant === "reply") return draft;
    return sequence.find((d) => d.templateVariant === "reply");
  }, [activeDraft, draft, sequence]);

  const needsReplyDraft = isReplyLead && phase !== "reply_sent" && !replyDraft;

  useEffect(() => {
    setSelectedNodeId(thread?.selectedNodeId);
  }, [thread?.selectedNodeId, lead.id]);

  useEffect(() => {
    if (isReplyLead && thread?.barMode === "reply" && phase !== "reply_sent") {
      setSelectedNodeId("reply");
    }
  }, [isReplyLead, thread?.barMode, phase, lead.id]);

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
    if (isReplyLead) {
      if (selectedNode?.outreachId && replyDraft?.id === selectedNode.outreachId) return replyDraft;
      if (selectedNode?.id === "reply" || selectedNode?.kind === "reply_draft" || selectedNode?.kind === "inbound") {
        return replyDraft;
      }
      return replyDraft;
    }
    if (selectedNode?.outreachId) {
      const fromSequence = sequence.find((d) => d.id === selectedNode.outreachId);
      if (fromSequence) return fromSequence;
      if (activeDraft?.id === selectedNode.outreachId) return activeDraft;
      if (draft?.id === selectedNode.outreachId) return draft;
    }
    return activeDraft ?? draft;
  }, [selectedNode, sequence, activeDraft, draft, isReplyLead, replyDraft]);

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
  const isEmptyCompose = canWrite && !hasDraft && !isReplyLead && (phase === "compose" || thread?.barMode === "hidden");
  const isEditableNode =
    isEmptyCompose ||
    selectedNode?.kind === "draft" ||
    selectedNode?.kind === "reply_draft" ||
    selectedNode?.kind === "scheduled" ||
    thread?.barMode === "drafts" ||
    (thread?.barMode === "reply" && isReplyDraft);
  const showComposeZone =
    isEditableNode ||
    thread?.showComposeZone ||
    (hasDraft && phase !== "reply_sent" && phase !== "complete");
  const followUpPosition =
    selectedNode?.kind === "scheduled" && selectedNode.id === "e2"
      ? 2
      : selectedNode?.kind === "scheduled" && selectedNode.id === "e3"
        ? 3
        : selectedNode?.kind === "draft" && selectedNode.id === "draft-2"
          ? 2
          : selectedNode?.kind === "draft" && selectedNode.id === "draft-3"
            ? 3
            : null;

  const showRegenerate =
    canWrite &&
    !isReplyLead &&
    (phase === "compose" ||
      thread?.barMode === "drafts" ||
      thread?.barMode === "hidden" ||
      thread?.barMode === "sequence");

  const sequenceState = thread?.sequenceState ?? "not_started";
  const showSyncReplies = lead.status === "outreached" || phase === "awaiting_reply";

  const statusSubtitle =
    generating
      ? "Writing drafts…"
      : phase === "reply_sent"
        ? "Reply sent in thread"
        : phase === "awaiting_reply"
          ? "Awaiting reply"
          : isReplyDraft || replyDraft
            ? "Reply draft"
            : needsReplyDraft
              ? "Reply received"
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

      if (followUpPosition === 2 || followUpPosition === 3) {
        setGeneratingLabel(`Regenerating Email ${followUpPosition}`);
        const regen = await regenerateSequenceStep(lead.id, followUpPosition, {
          outreachTemplate: selectedTemplate,
        });
        setActiveDraft(regen);
        onDraftUpdated(regen);
        setSelectedNodeId(followUpPosition === 2 ? "e2" : "e3");
        onSilentRefresh();
        toast.success(`Email ${followUpPosition} regenerated`);
        return;
      }

      const drafts = await runWriterSequence(lead.id, { outreachTemplate: selectedTemplate });
      setGeneratingLabel("Draft 3 of 3");
      const first = drafts[0];
      setActiveDraft(first);
      onDraftUpdated(first);
      setSelectedNodeId("draft-1");
      onSilentRefresh();
      toast.success("3 drafts ready", {
        action: {
          label: "View queue",
          onClick: () => window.location.assign("/email?tab=needs_review"),
        },
      });
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

  const regenerateLabel = generating
    ? "Writing…"
    : hasDraft
      ? isReplyLead
        ? "Regenerate reply"
        : followUpPosition
          ? `Regenerate E${followUpPosition}`
          : "Regenerate all"
      : "Write";

  const showWriterControl = showRegenerate || (isReplyLead && phase !== "reply_sent");

  const showProcessBar = (showComposeZone && isEditableNode && !generating) || (isEmptyCompose && !generating);

  const processActions = (
    <>
      {isReplyLead && phase !== "reply_sent" ? (
        <button
          type="button"
          disabled={!canWrite || generating || draftingReply}
          onClick={() => void handleDraftReply()}
          className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full bg-ish-black px-3 text-[11px] font-semibold text-white shadow-[var(--shadow-ish-sm)] transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <Sparkles className="size-3" />
          {draftingReply ? "Writing…" : replyDraft ? "Regenerate reply" : "Generate reply"}
        </button>
      ) : null}
      {showSyncReplies ? (
        <SyncRepliesButton
          leadId={lead.id}
          leadName={lead.name}
          compact
          onSynced={onSilentRefresh}
        />
      ) : null}
      {sequenceState !== "complete" ? (
        <SequenceControlButtons
          leadId={lead.id}
          sequenceState={sequenceState}
          disabled={!canWrite || generating}
          onUpdated={onSilentRefresh}
          onStartSequence={() => composeRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
        />
      ) : null}
      {showProcessBar ? (
        <>
          {!isEmptyCompose && resolvedDraft ? (
            <>
              <SpamMeter
                inboxScore={contentQuality?.inboxScore ?? resolvedDraft.inboxScore ?? resolvedDraft.deliverabilityScore}
                factors={contentQuality?.factors ?? []}
              />
              <SenderHealthMeter />
            </>
          ) : null}
          {showWriterControl ? (
            <div
              className={cn(
                "inline-flex h-7 shrink-0 overflow-hidden rounded-full border border-ish-border bg-white shadow-[var(--shadow-ish-sm)]",
                (!canWrite || generating) && "opacity-40",
              )}
            >
              {!isReplyLead && showRegenerate ? (
                <DropdownMenu modal={false} open={templateMenuOpen} onOpenChange={setTemplateMenuOpen}>
                  <DropdownMenuTrigger
                    disabled={!canWrite || generating}
                    className={cn(
                      "flex h-full items-center gap-1 border-r border-ish-border/80 px-2.5 text-[11px] font-semibold text-ish-ink outline-none",
                      "hover:bg-ish-canvas focus-visible:ring-2 focus-visible:ring-ish-black/20 disabled:cursor-not-allowed",
                    )}
                  >
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
              <button
                type="button"
                disabled={!canWrite || generating}
                onClick={() => void handleGenerate()}
                className="flex h-full items-center gap-1.5 bg-ish-black px-3 text-[11px] font-semibold text-white hover:bg-ish-black/90 disabled:cursor-not-allowed"
              >
                <FileText className="size-3" />
                {regenerateLabel}
              </button>
            </div>
          ) : null}
        </>
      ) : phase === "reply_sent" ? (
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
            href="/email?tab=active"
            className="inline-flex h-7 shrink-0 items-center rounded-full border border-ish-border bg-white px-3 text-[11px] font-semibold text-ish-ink hover:bg-ish-canvas"
          >
            View in Outreach Queue
          </Link>
        </>
      ) : null}
    </>
  );

  return (
    <div className="animate-ish-tab-in px-[22px] py-[18px]">
      <OutreachJourneyPanel
        thread={thread}
        statusSubtitle={statusSubtitle}
        processActions={processActions}
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
      ) : canWrite && !hasDraft && !generating ? (
        <div className="rounded-[20px] border border-dashed border-ish-stratus-blue/30 bg-gradient-to-br from-ish-canvas/80 to-white px-6 py-10 text-center shadow-[var(--shadow-ish-sm)]">
          <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl bg-ish-yellow-soft">
            <Sparkles className="size-5 text-ish-ink" />
          </div>
          <p className="text-[15px] font-bold text-ish-ink">Start your outreach sequence</p>
          <p className="mx-auto mt-1.5 max-w-md text-[12px] leading-relaxed text-ish-ink-soft">
            AI will write 3 emails for {lead.name ?? "this contact"} using the{" "}
            <span className="font-semibold text-ish-ink">{activeTemplate.shortLabel}</span> template.
          </p>
          <button
            type="button"
            disabled={!canWrite || generating}
            onClick={() => void handleGenerate()}
            className="mt-5 inline-flex items-center gap-2 rounded-full bg-ish-black px-5 py-2.5 text-[13px] font-semibold text-white shadow-[var(--shadow-ish-sm)] transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            <Sparkles className="size-4" />
            Write 3 emails
          </button>
        </div>
      ) : needsReplyDraft ? (
        <div className="rounded-[20px] border border-ish-stratus-blue/25 bg-gradient-to-br from-ish-green-soft/40 to-white px-6 py-10 text-center shadow-[var(--shadow-ish-sm)]">
          <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl bg-ish-green-soft">
            <Sparkles className="size-5 text-ish-stratus-blue" />
          </div>
          <p className="text-[15px] font-bold text-ish-ink">They replied</p>
          {thread?.inboundSnippet ? (
            <p className="mx-auto mt-3 max-w-lg rounded-[14px] bg-white/80 px-4 py-3 text-left text-[12px] italic leading-relaxed text-ish-ink-soft ring-1 ring-ish-border/50">
              &ldquo;{thread.inboundSnippet}&rdquo;
            </p>
          ) : null}
          <p className="mx-auto mt-3 max-w-md text-[12px] leading-relaxed text-ish-ink-soft">
            Generate a smart reply using their message, your original outreach, and gifting context.
          </p>
          <button
            type="button"
            disabled={!canWrite || draftingReply}
            onClick={() => void handleDraftReply()}
            className="mt-5 inline-flex items-center gap-2 rounded-full bg-ish-black px-5 py-2.5 text-[13px] font-semibold text-white shadow-[var(--shadow-ish-sm)] transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {draftingReply ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {draftingReply ? "Writing reply…" : "Generate AI reply"}
          </button>
        </div>
      ) : draftingReply ? (
        <div className="rounded-[20px] border border-ish-border bg-white py-12 shadow-[var(--shadow-ish-sm)]">
          <WritingLoader contactName={lead.name} companyName={lead.company} sequenceLabel="Drafting reply" />
        </div>
      ) : showComposeZone && isEditableNode && resolvedDraft ? (
        <div ref={composeRef}>
          <OutreachApprovalCard
            key={resolvedDraft.id}
            draft={resolvedDraft}
            leadId={lead.id}
            leadStatus={lead.status}
            contactName={lead.name}
            companyName={lead.company}
            contactEmail={lead.email}
            emailThread={thread}
            onDraftUpdated={(d) => {
              setActiveDraft(d);
              onDraftUpdated(d);
            }}
            onSavingChange={setDraftSaving}
            contentScore={contentQuality?.inboxScore ?? resolvedDraft.inboxScore ?? resolvedDraft.deliverabilityScore}
            onSent={onSent ?? onSilentRefresh}
            onGenerateReply={() => void handleDraftReply()}
            generatingReply={draftingReply}
            onSendFailed={onSilentRefresh}
          />
        </div>
      ) : isEmptyCompose ? (
        <div className="rounded-[20px] border border-dashed border-ish-stratus-blue/25 bg-ish-canvas/30 px-6 py-14 text-center shadow-[var(--shadow-ish-sm)]">
          <p className="text-[15px] font-bold text-ish-ink">Ready to write outreach</p>
          <p className="mx-auto mt-2 max-w-md text-[12px] leading-relaxed text-ish-ink-soft">
            AI will draft a 3-email sequence for {lead.name || "this contact"}. Pick a template above, then click Write.
          </p>
          <Button
            type="button"
            size="sm"
            disabled={!canWrite || generating}
            className="mt-5 h-auto rounded-full bg-ish-black px-5 py-2.5 text-[12px] font-semibold text-white hover:bg-ish-black/90 disabled:opacity-40"
            onClick={() => void handleGenerate()}
          >
            <FileText className="size-3.5" />
            Write 3 emails
          </Button>
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

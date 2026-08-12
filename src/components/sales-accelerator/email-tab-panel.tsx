"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, FileText, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/design-system";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { runWriterSequence, runReplyWriter, runWriterStream, updateLeadStatus, regenerateSequenceStep, type WriterMode } from "@/lib/api-client";
import { useIsMobileLayout } from "@/hooks/use-media-query";
import { scoreSpamMeter } from "@/lib/agents/writer-scoring";
import type { LeadDetailRecord, WriterDraft } from "@/lib/api-client";
import { isContactReadyStage } from "@/lib/pipeline-status";
import { OUTREACH_TEMPLATES, type OutreachTemplateId } from "@/lib/email/outreach-templates";
import { CREDIT_COSTS } from "@/lib/billing/credit-costs";
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
  const isMobileLayout = useIsMobileLayout();
  const [streamMessage, setStreamMessage] = useState<string | null>(null);
  const composeRef = useRef<HTMLDivElement>(null);
  const thread = lead.emailThread;
  const sequence = lead.outreachSequence ?? [];

  const [selectedNodeId, setSelectedNodeId] = useState<string | undefined>(thread?.selectedNodeId);
  const [activeDraft, setActiveDraft] = useState<WriterDraft | undefined>(draft);
  const templates = useMemo(() => {
    const all = lead.outreachTemplates?.length ? lead.outreachTemplates : OUTREACH_TEMPLATES;
    const primary = all.filter((t) => t.id !== "follow_up" && t.id !== "final_reminder");
    return primary.length ? primary : all;
  }, [lead.outreachTemplates]);
  const [selectedTemplate, setSelectedTemplate] = useState<OutreachTemplateId>(
    (draft?.templateVariant as OutreachTemplateId) ?? templates[0]?.id ?? OUTREACH_TEMPLATES[0].id,
  );
  const [writerMode, setWriterMode] = useState<WriterMode>("standard");
  const [writerModeMenuOpen, setWriterModeMenuOpen] = useState(false);
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

  useEffect(() => {
    if (!templates.some((t) => t.id === selectedTemplate)) {
      setSelectedTemplate(templates[0]?.id ?? OUTREACH_TEMPLATES[0].id);
    }
  }, [templates, selectedTemplate]);

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
  const activeTemplate = templates.find((t) => t.id === selectedTemplate) ?? templates[0] ?? OUTREACH_TEMPLATES[0];
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

  async function handleGenerate() {
    setGenerating(true);
      setGeneratingLabel(writerMode === "ai" ? "Writing Email 1 of 3" : "Draft 1 of 3");
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
          writerMode,
        });
        setActiveDraft(regen);
        onDraftUpdated(regen);
        setSelectedNodeId(followUpPosition === 2 ? "e2" : "e3");
        onSilentRefresh();
        toast.success(`Email ${followUpPosition} regenerated`);
        return;
      }

      if (isMobileLayout) {
        setStreamMessage("Starting smart emails...");
        const draft = await runWriterStream(lead.id, { outreachTemplate: selectedTemplate, writerMode }, (ev) => {
          if (ev.type === "progress" && ev.message) setStreamMessage(ev.message);
        });
        setStreamMessage(null);
        setActiveDraft(draft);
        onDraftUpdated(draft);
        setSelectedNodeId("draft-1");
        onSilentRefresh();
        toast.success("Draft ready", {
          action: { label: "Inbox", onClick: () => window.location.assign("/inbox") },
        });
        return;
      }

      const drafts = await runWriterSequence(lead.id, { outreachTemplate: selectedTemplate, writerMode });
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
      const message = e instanceof Error ? e.message : isReplyLead ? "Reply draft failed" : "Email draft failed";
      toast.error(message);
      if (!/quota/i.test(message)) console.error(e);
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
    ? "Writing smart emails…"
    : hasDraft
      ? isReplyLead
        ? "Regenerate reply"
        : followUpPosition
          ? `Regenerate E${followUpPosition}`
          : "Regenerate all"
      : "Write smart emails";

  const draftCreditCost = CREDIT_COSTS["writer.draft"] ?? 8;
  const writeCredits = isReplyLead
    ? 0
    : followUpPosition
      ? draftCreditCost
      : isMobileLayout
        ? draftCreditCost
        : draftCreditCost * 3;

  const showWriterControl = showRegenerate || (isReplyLead && phase !== "reply_sent");

  const showProcessBar = (showComposeZone && isEditableNode && !generating) || (isEmptyCompose && !generating);

  const processActions = (
    <>
      {isReplyLead && phase !== "reply_sent" ? (
        <button
          type="button"
          disabled={!canWrite || generating || draftingReply}
          onClick={() => void handleDraftReply()}
          className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full bg-brand-black px-3 text-[11px] font-semibold text-white shadow-[var(--shadow-brand-sm)] transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <Sparkles className="size-3" />
          {draftingReply ? "Writing smart emails…" : replyDraft ? "Regenerate reply" : "Generate reply"}
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
                "inline-flex h-6 shrink-0 overflow-hidden rounded-full border border-brand-stratus-blue/25 bg-white",
                (!canWrite || generating) && "opacity-40",
              )}
            >
              {!isReplyLead && showRegenerate ? (
                <DropdownMenu modal={false} open={writerModeMenuOpen} onOpenChange={setWriterModeMenuOpen}>
                  <DropdownMenuTrigger
                    disabled={!canWrite || generating}
                    className={cn(
                      "flex h-full items-center gap-0.5 border-r border-brand-stratus-blue/15 px-2 text-[11px] font-semibold text-brand-ink outline-none",
                      "hover:bg-brand-canvas focus-visible:ring-2 focus-visible:ring-brand-black/20 disabled:cursor-not-allowed",
                    )}
                  >
                    <span>{writerMode === "ai" ? "AI Writer" : "Standard"}</span>
                    <ChevronDown className="size-3 text-brand-ink-faint" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-[220px]">
                    <DropdownMenuRadioGroup
                      value={writerMode}
                      onValueChange={(v) => {
                        setWriterMode(v as WriterMode);
                        setWriterModeMenuOpen(false);
                      }}
                    >
                      <DropdownMenuRadioItem value="standard" className="text-[12px]">
                        <div>
                          <div className="font-semibold">Standard</div>
                          <div className="text-[11px] text-brand-ink-faint">Fills the ISH templates with name and company</div>
                        </div>
                      </DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="ai" className="text-[12px]">
                        <div>
                          <div className="font-semibold">AI Writer</div>
                          <div className="text-[11px] text-brand-ink-faint">Uses the Smart email plan, then writes with AI</div>
                        </div>
                      </DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
              {!isReplyLead && showRegenerate ? (
                <DropdownMenu modal={false} open={templateMenuOpen} onOpenChange={setTemplateMenuOpen}>
                  <DropdownMenuTrigger
                    disabled={!canWrite || generating}
                    className={cn(
                      "flex h-full items-center gap-0.5 border-r border-brand-stratus-blue/15 px-2 text-[11px] font-semibold text-brand-ink outline-none",
                      "hover:bg-brand-canvas focus-visible:ring-2 focus-visible:ring-brand-black/20 disabled:cursor-not-allowed",
                    )}
                  >
                    <span>{activeTemplate.shortLabel}</span>
                    <ChevronDown className="size-3 text-brand-ink-faint" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-[220px]">
                    <DropdownMenuRadioGroup
                      value={selectedTemplate}
                      onValueChange={(v) => {
                        setSelectedTemplate(v as OutreachTemplateId);
                        setTemplateMenuOpen(false);
                      }}
                    >
                      {templates.map((template) => (
                        <DropdownMenuRadioItem key={template.id} value={template.id} className="text-[12px]">
                          <div>
                            <div className="font-semibold">{template.label}</div>
                            <div className="text-[11px] text-brand-ink-faint">{template.description}</div>
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
                className="flex h-full items-center gap-1 bg-brand-black px-2.5 text-[11px] font-semibold text-white hover:bg-brand-black/90 disabled:cursor-not-allowed"
              >
                <FileText className="size-3" />
                {regenerateLabel}
                {writeCredits > 0 && !generating ? (
                  <span className="font-medium opacity-70">· {writeCredits} cr</span>
                ) : null}
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
            className="h-7 shrink-0 rounded-full bg-brand-black px-3 text-[11px] font-semibold text-white hover:bg-brand-black/90 disabled:opacity-40"
            onClick={() => void handleMarkTastingSent()}
          >
            {advancing ? "Updating…" : "Mark tasting sent"}
          </Button>
          <Link
            href="/email?tab=active"
            className="shrink-0 text-[11px] font-semibold text-brand-stratus-blue underline-offset-2 hover:underline lg:inline-flex lg:h-7 lg:items-center lg:rounded-full lg:border lg:border-brand-border lg:bg-white lg:px-3 lg:text-brand-ink lg:no-underline lg:hover:bg-brand-canvas"
          >
            View in Email
          </Link>
        </>
      ) : null}
    </>
  );

  return (
    <div className="ish-email-tab animate-brand-tab-in min-w-0 space-y-3 overflow-hidden px-0 py-1 lg:space-y-4 lg:px-[22px] lg:py-3">
      <OutreachJourneyPanel
        thread={thread}
        processActions={processActions}
        selectedNodeId={selectedNodeId}
        onNodeSelect={handleNodeSelect}
        onDraftReply={() => void handleDraftReply()}
        draftReplyLoading={draftingReply}
      />

      {generating ? (
        <div className="border-y border-brand-border bg-white py-10 lg:mx-0 lg:rounded-[20px] lg:border lg:py-12 lg:shadow-[var(--shadow-brand-sm)]">
          {streamMessage ? (
        <div className="mx-3 rounded-xl bg-brand-yellow-soft px-3 py-2.5 text-[13px] font-medium text-brand-ink lg:mx-4 lg:px-4 lg:py-3">{streamMessage}</div>
      ) : null}
      <WritingLoader
            contactName={lead.name}
            companyName={lead.company}
            sequenceLabel={generatingLabel}
          />
        </div>
      ) : canWrite && !hasDraft && !generating ? (
        <div className="border-y border-dashed border-brand-stratus-blue/30 bg-gradient-to-br from-brand-canvas/80 to-white px-4 py-8 text-center lg:rounded-[20px] lg:border lg:px-6 lg:py-10 lg:shadow-[var(--shadow-brand-sm)]">
          <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl bg-brand-yellow-soft">
            <Sparkles className="size-5 text-brand-ink" />
          </div>
          <p className="text-[15px] font-bold text-brand-ink">Start writing smart emails</p>
          <p className="mx-auto mt-1.5 max-w-md text-[12px] leading-relaxed text-brand-ink-soft">
            AI will write 3 smart emails for {lead.name ?? "this contact"} using the{" "}
            <span className="font-semibold text-brand-ink">{activeTemplate.shortLabel}</span> template.
          </p>
          <button
            type="button"
            disabled={!canWrite || generating}
            onClick={() => void handleGenerate()}
            className="mt-5 inline-flex items-center gap-2 rounded-full bg-brand-black px-5 py-2.5 text-[13px] font-semibold text-white shadow-[var(--shadow-brand-sm)] transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            <Sparkles className="size-4" />
            Write smart emails
          </button>
        </div>
      ) : needsReplyDraft ? (
        <div className="border-y border-brand-stratus-blue/25 bg-gradient-to-br from-brand-green-soft/40 to-white px-4 py-8 text-center lg:rounded-[20px] lg:border lg:px-6 lg:py-10 lg:shadow-[var(--shadow-brand-sm)]">
          <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl bg-brand-green-soft">
            <Sparkles className="size-5 text-brand-stratus-blue" />
          </div>
          <p className="text-[15px] font-bold text-brand-ink">They replied</p>
          {thread?.inboundSnippet ? (
            <p className="mx-auto mt-3 max-w-lg rounded-[14px] bg-white/80 px-4 py-3 text-left text-[12px] italic leading-relaxed text-brand-ink-soft ring-1 ring-brand-border/50">
              &ldquo;{thread.inboundSnippet}&rdquo;
            </p>
          ) : null}
          <p className="mx-auto mt-3 max-w-md text-[12px] leading-relaxed text-brand-ink-soft">
            Generate a smart reply using their message, your original outreach, and gifting context.
          </p>
          <button
            type="button"
            disabled={!canWrite || draftingReply}
            onClick={() => void handleDraftReply()}
            className="mt-5 inline-flex items-center gap-2 rounded-full bg-brand-black px-5 py-2.5 text-[13px] font-semibold text-white shadow-[var(--shadow-brand-sm)] transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {draftingReply ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {draftingReply ? "Writing smart emails…" : "Generate AI reply"}
          </button>
        </div>
      ) : draftingReply ? (
        <div className="border-y border-brand-border bg-white py-10 lg:rounded-[20px] lg:border lg:py-12 lg:shadow-[var(--shadow-brand-sm)]">
          <WritingLoader contactName={lead.name} companyName={lead.company} sequenceLabel="Drafting reply" />
        </div>
      ) : showComposeZone && isEditableNode && resolvedDraft ? (
        <div ref={composeRef} className="pt-3">
          <OutreachApprovalCard
            key={resolvedDraft.id}
            draft={resolvedDraft}
            leadId={lead.id}
            leadStatus={lead.status}
            contactName={lead.name}
            companyName={lead.company}
            contactEmail={lead.email}
            contactEmails={lead.emails}
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
            startSequenceDraft={
              sequence.find((d) => d.sequencePosition === 1) ??
              (resolvedDraft.sequencePosition === 1 ? resolvedDraft : undefined)
            }
          />
        </div>
      ) : isEmptyCompose ? (
        <div className="border-y border-dashed border-brand-stratus-blue/25 bg-brand-canvas/30 px-4 py-10 text-center lg:rounded-[20px] lg:border lg:px-6 lg:py-14 lg:shadow-[var(--shadow-brand-sm)]">
          <p className="text-[15px] font-bold text-brand-ink">Ready to write smart emails</p>
          <p className="mx-auto mt-2 max-w-md text-[12px] leading-relaxed text-brand-ink-soft">
            {writerMode === "ai"
              ? `AI Writer will use the Smart email plan on Summary, then draft a 3-email sequence for ${lead.name || "this contact"}. Pick a template above, then click Write smart emails.`
              : `Standard fills the ISH templates for ${lead.name || "this contact"}. Pick a template above, then click Write smart emails.`}
          </p>
          <Button
            type="button"
            size="sm"
            disabled={!canWrite || generating}
            className="mt-5 h-auto rounded-full bg-brand-black px-5 py-2.5 text-[12px] font-semibold text-white hover:bg-brand-black/90 disabled:opacity-40"
            onClick={() => void handleGenerate()}
          >
            <FileText className="size-3.5" />
            Write smart emails
          </Button>
        </div>
      ) : (phase === "reply_sent" || phase === "complete") && isReplyLead ? (
        <div className="flex justify-end pt-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-auto rounded-full bg-brand-black px-4 py-2 text-[12px] font-semibold text-white"
            onClick={() => void handleGenerate()}
          >
            Draft another reply
          </Button>
        </div>
      ) : null}
    </div>
  );
}

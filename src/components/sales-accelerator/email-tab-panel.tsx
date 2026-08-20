"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, FileText, Loader2, Mail, Plus, Save, Send, Sparkles } from "lucide-react";
import { Button } from "@/design-system";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { runWriterSequence, runReplyWriter, runWriterStream, updateLeadStatus, regenerateSequenceStep, updateOutreachDraft, type WriterMode } from "@/lib/api-client";
import { useIsMobileLayout } from "@/hooks/use-media-query";
import { scoreSpamMeter } from "@/lib/agents/writer-scoring";
import type { LeadDetailRecord, WriterDraft } from "@/lib/api-client";
import { isContactReadyStage } from "@/lib/pipeline-status";
import { asVariantKey, type VariantKey } from "@/lib/email/draft-variants";
import { OUTREACH_TEMPLATES, type OutreachTemplateId } from "@/lib/email/outreach-templates";
import { WRITE_THEME_OCCASIONS, FESTIVE_OCCASION_SENTINEL, occasionIdFromTags } from "@/lib/occasions/catalog";
import { latestDetectedOccasion } from "@/lib/occasions/resolve";
import { CREDIT_COSTS } from "@/lib/billing/credit-costs";
import { WritingLoader } from "./writing-loader";
import {
  OutreachApprovalCard,
  type ComposeActionState,
  type OutreachApprovalHandle,
} from "./outreach-approval-card";
import {
  defaultSelectedContactEmails,
  EMPTY_SEND_TO_HINT,
  retainSelectedRecipientEmails,
} from "@/lib/outreach/send-recipients";
import { sanitizeEmail } from "@/lib/enrichment/validate-contact";
import { OutreachJourneyPanel } from "./outreach-journey-panel";
import { SequenceControlButtons } from "./sequence-control-buttons";
import { SyncRepliesButton } from "./sync-replies-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function ToolbarRule() {
  return <span className="ish-scout-rule mx-0.5 hidden lg:block" aria-hidden />;
}

type Props = {
  lead: LeadDetailRecord;
  draft?: WriterDraft;
  onDraftUpdated: (draft: WriterDraft, sequence?: WriterDraft[]) => void;
  onSilentRefresh: () => void;
  onSent?: () => void;
};

export function EmailTabPanel({ lead, draft, onDraftUpdated, onSilentRefresh, onSent }: Props) {
  const isMobileLayout = useIsMobileLayout();
  const [streamMessage, setStreamMessage] = useState<string | null>(null);
  const thread = lead.emailThread;
  const sequence = lead.outreachSequence ?? [];

  const [selectedNodeId, setSelectedNodeId] = useState<string | undefined>(thread?.selectedNodeId);
  const [activeDraft, setActiveDraft] = useState<WriterDraft | undefined>(draft);
  const templates = useMemo(() => {
    const all = lead.outreachTemplates?.length ? lead.outreachTemplates : OUTREACH_TEMPLATES;
    const primary = all.filter((t) => t.id !== "follow_up" && t.id !== "final_reminder");
    return primary.length ? primary : all;
  }, [lead.outreachTemplates]);
  const defaultTemplateId =
    lead.defaultOutreachCta && templates.some((t) => t.id === lead.defaultOutreachCta)
      ? (lead.defaultOutreachCta as OutreachTemplateId)
      : templates[0]?.id ?? OUTREACH_TEMPLATES[0].id;
  const [selectedTemplate, setSelectedTemplate] = useState<OutreachTemplateId>(
    (draft?.templateVariant as OutreachTemplateId) ?? defaultTemplateId,
  );
  const [writerMode, setWriterMode] = useState<WriterMode>("standard");
  const [writeOptionsOpen, setWriteOptionsOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generatingLabel, setGeneratingLabel] = useState<string | undefined>();
  const detectedOccasion = latestDetectedOccasion(lead.companyOverview);
  const taggedOccasion = occasionIdFromTags(lead.tags);
  const defaultOccasion =
    taggedOccasion ?? (detectedOccasion?.type ? detectedOccasion.type : FESTIVE_OCCASION_SENTINEL);
  const [selectedOccasion, setSelectedOccasion] = useState<string>(defaultOccasion);
  const [draftSaving, setDraftSaving] = useState(false);
  const [composeActions, setComposeActions] = useState<ComposeActionState | null>(null);
  const approvalRef = useRef<OutreachApprovalHandle>(null);
  const composeRef = useRef<HTMLDivElement>(null);
  const [sequenceRecipients, setSequenceRecipients] = useState<string[]>(() =>
    defaultSelectedContactEmails(lead.email, lead.emails),
  );
  const [extraRecipient, setExtraRecipient] = useState("");
  const [sequenceSubjectKey, setSequenceSubjectKey] = useState<VariantKey>("A");
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
    if (draft?.templateVariant && draft.templateVariant !== "reply") return;
    const preferred = lead.defaultOutreachCta as OutreachTemplateId | undefined;
    if (preferred && templates.some((t) => t.id === preferred)) {
      setSelectedTemplate(preferred);
    }
  }, [lead.id, lead.defaultOutreachCta, templates, draft?.templateVariant]);

  useEffect(() => {
    if (!templates.some((t) => t.id === selectedTemplate)) {
      setSelectedTemplate(templates[0]?.id ?? OUTREACH_TEMPLATES[0].id);
    }
  }, [templates, selectedTemplate]);

  useEffect(() => {
    const defaults = defaultSelectedContactEmails(lead.email, lead.emails);
    const listed = [lead.email, ...(lead.emails ?? []).map((e) => e.email)].filter(
      (e): e is string => Boolean(e),
    );
    setSequenceRecipients((prev) => retainSelectedRecipientEmails(prev, listed, new Set(), defaults));
  }, [lead.id, lead.email, lead.emails]);

  useEffect(() => {
    const e1 = sequence.find((d) => d.sequencePosition === 1);
    setSequenceSubjectKey(asVariantKey(e1?.chosenSubjectKey ?? draft?.chosenSubjectKey));
  }, [lead.id]);

  useEffect(() => {
    setSelectedOccasion(taggedOccasion ?? (detectedOccasion?.type ? detectedOccasion.type : FESTIVE_OCCASION_SENTINEL));
  }, [lead.id, taggedOccasion, detectedOccasion?.type]);

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
      if (activeDraft?.id === selectedNode.outreachId) return activeDraft;
      const fromSequence = sequence.find((d) => d.id === selectedNode.outreachId);
      if (fromSequence) return fromSequence;
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
  const showOccasionPicker = templates.some((t) => t.id === "gift_sampling");
  const selectedOccasionDef =
    selectedOccasion === FESTIVE_OCCASION_SENTINEL
      ? { id: FESTIVE_OCCASION_SENTINEL, label: "Festive", pitch: "Seasonal Diwali and festival boxes" }
      : WRITE_THEME_OCCASIONS.find((o) => o.id === selectedOccasion) ??
        { id: selectedOccasion, label: selectedOccasion, pitch: detectedOccasion?.label ?? "Account event" };
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
          occasionTheme: selectedOccasion,
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
        const draft = await runWriterStream(lead.id, { outreachTemplate: selectedTemplate, writerMode, occasionTheme: selectedOccasion }, (ev) => {
          if (ev.type === "progress" && ev.message) setStreamMessage(ev.message);
        });
        setStreamMessage(null);
        setActiveDraft(draft);
        onDraftUpdated(draft, draft.sequencePosition != null ? [draft] : undefined);
        setSelectedNodeId("draft-1");
        onSilentRefresh();
        toast.success("Draft ready", {
          action: { label: "Inbox", onClick: () => window.location.assign("/inbox") },
        });
        return;
      }

      const drafts = await runWriterSequence(lead.id, { outreachTemplate: selectedTemplate, writerMode, occasionTheme: selectedOccasion });
      setGeneratingLabel("Draft 3 of 3");
      const first = drafts[0];
      setActiveDraft(first);
      setSequenceSubjectKey(asVariantKey(first.chosenSubjectKey));
      onDraftUpdated(first, drafts);
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

  function handleSequenceSubjectKey(key: VariantKey) {
    setSequenceSubjectKey(key);
    const ids = sequence
      .filter((d) => d.templateVariant !== "reply")
      .map((d) => d.id);
    void Promise.all(
      ids.map((leadOutreachId) => updateOutreachDraft({ leadOutreachId, chosenSubjectKey: key })),
    ).catch(() => {
      toast.error("Could not save the subject choice for all emails");
    });
  }

  function handleNodeSelect(nodeId: string) {
    setSelectedNodeId(nodeId);
    const node = thread?.barNodes.find((n) => n.id === nodeId);
    if (node?.outreachId) {
      const d = sequence.find((s) => s.id === node.outreachId) ?? (draft?.id === node.outreachId ? draft : undefined);
      if (d) {
        setActiveDraft(d);
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

  const writeOptionsSummary = [
    writerMode === "ai" ? "AI" : "Standard",
    activeTemplate.shortLabel,
    showOccasionPicker ? selectedOccasionDef.label : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const sentEmailKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const ev of thread?.events ?? []) {
      if (
        ev.recipientEmail &&
        (ev.status === "sent" || ev.status === "opened" || ev.status === "bounced")
      ) {
        keys.add(ev.recipientEmail.trim().toLowerCase());
      }
    }
    for (const node of thread?.barNodes ?? []) {
      if (node.recipientEmail && (node.kind === "sent" || node.bouncedAt)) {
        keys.add(node.recipientEmail.trim().toLowerCase());
      }
    }
    for (const entry of lead.emails ?? []) {
      if (entry.testStatus === "sent") keys.add(entry.email.trim().toLowerCase());
    }
    return keys;
  }, [thread?.events, thread?.barNodes, lead.emails]);

  const recipientOptions = useMemo(() => {
    const seen = new Set<string>();
    const out: { email: string; label?: string; sent: boolean }[] = [];
    const add = (email: string, label?: string) => {
      const key = email.trim().toLowerCase();
      if (!key || !key.includes("@") || key === "—" || seen.has(key)) return;
      seen.add(key);
      out.push({ email: email.trim(), label, sent: sentEmailKeys.has(key) });
    };
    if (lead.email?.trim()) add(lead.email.trim(), "Primary");
    for (const entry of lead.emails ?? []) {
      const label =
        entry.pattern === "first"
          ? "firstname@ guess"
          : entry.pattern === "last"
            ? "lastname@ guess"
            : entry.enrichmentProvider === "permutation"
              ? "Guessed"
              : entry.pattern === "first.last"
                ? "first.last"
                : undefined;
      add(entry.email, label);
    }
    for (const email of sequenceRecipients) {
      add(email, "Added");
    }
    return out;
  }, [lead.email, lead.emails, sentEmailKeys, sequenceRecipients]);

  const isLaterSequenceDraft =
    resolvedDraft?.sequencePosition === 2 || resolvedDraft?.sequencePosition === 3;
  const needsInboxPick = sequenceRecipients.length === 0;
  const showRecipientControl = showProcessBar && (!isLaterSequenceDraft || needsInboxPick);
  const recipientTriggerLabel = needsInboxPick
    ? "Pick inbox"
    : sequenceRecipients.length === 1
      ? sequenceRecipients[0]
      : `${sequenceRecipients.length} inboxes`;

  function addTypedRecipient() {
    const cleaned = sanitizeEmail(extraRecipient);
    if (!cleaned) {
      toast.error("Enter a valid email address");
      return;
    }
    setSequenceRecipients((prev) =>
      prev.some((e) => e.toLowerCase() === cleaned) ? prev : [...prev, cleaned],
    );
    setExtraRecipient("");
  }

  function toggleRecipient(email: string) {
    if (sentEmailKeys.has(email.trim().toLowerCase())) return;
    setSequenceRecipients((prev) => {
      if (prev.some((e) => e.toLowerCase() === email.toLowerCase())) {
        return prev.filter((e) => e.toLowerCase() !== email.toLowerCase());
      }
      return [...prev, email];
    });
  }

  const processActions = (
    <>
      {showRecipientControl ? (
        <DropdownMenu modal={false}>
            <DropdownMenuTrigger
              className={cn(
                "ish-scout-ghost inline-flex h-7 max-w-[12rem] shrink-0 items-center gap-1 rounded-full px-2.5 text-[11px] font-semibold text-brand-ink outline-none transition-all",
                "hover:opacity-95 focus-visible:ring-2 focus-visible:ring-brand-stratus-blue/25",
                needsInboxPick && "ring-2 ring-brand-stratus-blue/30",
              )}
            >
              <Mail className="size-3 shrink-0 text-brand-stratus-blue" />
              <span className="truncate">{recipientTriggerLabel}</span>
              <ChevronDown className="size-3 shrink-0 text-brand-ink-faint" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="ish-email-write-menu w-[min(100vw-2rem,280px)] rounded-[16px] p-1.5">
              <DropdownMenuLabel className="px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-brand-ink-faint">
                Send to
              </DropdownMenuLabel>
              {needsInboxPick ? (
                <p className="px-2 pb-1.5 text-[11px] leading-snug text-brand-ink-soft">
                  Choose an inbox, or add one below. firstname@ and lastname@ guesses are not used until you pick them.
                </p>
              ) : null}
              {recipientOptions.length ? (
                recipientOptions.map((entry) => {
                const checked = sequenceRecipients.some(
                  (e) => e.toLowerCase() === entry.email.toLowerCase(),
                );
                return (
                  <DropdownMenuItem
                    key={entry.email}
                    disabled={entry.sent}
                    closeOnClick={false}
                    onClick={() => toggleRecipient(entry.email)}
                    className="text-[12px]"
                  >
                    <span
                      className={cn(
                        "flex size-4 shrink-0 items-center justify-center rounded-[4px] border",
                        checked
                          ? "border-brand-stratus-blue bg-brand-stratus-blue text-white"
                          : "border-brand-stratus-blue/30 bg-white",
                      )}
                    >
                      {checked ? <Check className="size-3" strokeWidth={2.5} /> : null}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-brand-ink">{entry.email}</div>
                      <div className="text-[10px] text-brand-ink-faint">
                        {entry.sent ? "Already sent" : entry.label ?? "Inbox"}
                      </div>
                    </div>
                  </DropdownMenuItem>
                );
              })
              ) : (
                <p className="px-2 py-1 text-[11px] text-brand-ink-soft">No saved inboxes yet.</p>
              )}
              <DropdownMenuSeparator />
              <div className="flex items-center gap-1 px-1 py-1" onPointerDown={(e) => e.stopPropagation()}>
                <input
                  type="email"
                  value={extraRecipient}
                  onChange={(e) => setExtraRecipient(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTypedRecipient();
                    }
                  }}
                  placeholder="Add another email"
                  className="min-w-0 flex-1 rounded-[8px] border border-brand-stratus-blue/20 bg-white px-2 py-1 text-[11px] text-brand-ink outline-none placeholder:text-brand-ink-faint focus:ring-1 focus:ring-brand-stratus-blue/30"
                />
                <button
                  type="button"
                  onClick={addTypedRecipient}
                  className="inline-flex size-7 shrink-0 items-center justify-center rounded-[8px] text-brand-stratus-blue hover:bg-brand-canvas"
                  aria-label="Add another email"
                >
                  <Plus className="size-3.5" />
                </button>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
      ) : null}
      {isReplyLead && phase !== "reply_sent" ? (
        <button
          type="button"
          disabled={!canWrite || generating || draftingReply}
          onClick={() => void handleDraftReply()}
          className="ish-scout-cta-blue inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-3 text-[11px] font-semibold transition-opacity hover:opacity-95 disabled:opacity-50"
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
          className="ish-scout-ghost border-0 shadow-none"
        />
      ) : null}
      <SequenceControlButtons
        leadId={lead.id}
        sequenceState={sequenceState}
        disabled={generating}
        sending={composeActions?.sending}
        onUpdated={onSilentRefresh}
        onStartSequence={async () => {
          composeRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
          if (approvalRef.current && composeActions && !composeActions.viewInEmailOnly) {
            if (composeActions.sending) return;
            if (!composeActions.canSend) {
              if (!sequenceRecipients.length) {
                toast.error(EMPTY_SEND_TO_HINT);
              } else {
                toast.error("Outreach sending is paused. Resume with Start sending on the Email queue or in Settings.");
              }
              return;
            }
            await approvalRef.current.send();
            return;
          }
          toast.message("Review the draft, then click Send to start the sequence");
        }}
      />
      {showProcessBar ? (
        <>
          {showWriterControl ? (
            <>
              <ToolbarRule />
              <DropdownMenu modal={false} open={writeOptionsOpen} onOpenChange={setWriteOptionsOpen}>
                <DropdownMenuTrigger
                  disabled={!canWrite || generating}
                  className={cn(
                    "ish-scout-ghost inline-flex h-7 max-w-[11rem] shrink-0 items-center gap-1 rounded-full px-2.5 text-[11px] font-semibold text-brand-ink outline-none transition-all",
                    "hover:opacity-95 focus-visible:ring-2 focus-visible:ring-brand-stratus-blue/25 disabled:cursor-not-allowed disabled:opacity-40",
                  )}
                >
                  <span className="truncate">{writeOptionsSummary}</span>
                  <ChevronDown className="size-3 shrink-0 text-brand-ink-faint" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="ish-email-write-menu w-[min(100vw-2rem,280px)] rounded-[16px] p-2">
                  {!isReplyLead && showRegenerate ? (
                    <>
                      <DropdownMenuLabel className="px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-brand-ink-faint">
                        Writer
                      </DropdownMenuLabel>
                      <DropdownMenuItem
                        className="text-[12px]"
                        closeOnClick={false}
                        onClick={() => setWriterMode("standard")}
                      >
                        <span className="w-3 shrink-0">{writerMode === "standard" ? <Check className="size-3 text-brand-stratus-blue" /> : null}</span>
                        <div>
                          <div className="font-semibold">Standard</div>
                          <div className="text-[11px] text-brand-ink-faint">Fills ISH templates with name and company</div>
                        </div>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-[12px]"
                        closeOnClick={false}
                        onClick={() => setWriterMode("ai")}
                      >
                        <span className="w-3 shrink-0">{writerMode === "ai" ? <Check className="size-3 text-brand-stratus-blue" /> : null}</span>
                        <div>
                          <div className="font-semibold">AI Writer</div>
                          <div className="text-[11px] text-brand-ink-faint">Writes with AI using research and brand context</div>
                        </div>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel className="px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-brand-ink-faint">
                        Template
                      </DropdownMenuLabel>
                      {templates.map((template) => (
                        <DropdownMenuItem
                          key={template.id}
                          className="text-[12px]"
                          closeOnClick={false}
                          onClick={() => setSelectedTemplate(template.id)}
                        >
                          <span className="w-3 shrink-0">
                            {selectedTemplate === template.id ? <Check className="size-3 text-brand-stratus-blue" /> : null}
                          </span>
                          <div>
                            <div className="font-semibold">{template.label}</div>
                            <div className="text-[11px] text-brand-ink-faint">{template.description}</div>
                          </div>
                        </DropdownMenuItem>
                      ))}
                      {showOccasionPicker ? (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuLabel className="px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-brand-ink-faint">
                            Occasion
                          </DropdownMenuLabel>
                          <DropdownMenuItem
                            className="text-[12px]"
                            closeOnClick={false}
                            onClick={() => setSelectedOccasion(FESTIVE_OCCASION_SENTINEL)}
                          >
                            <span className="w-3 shrink-0">
                              {selectedOccasion === FESTIVE_OCCASION_SENTINEL ? (
                                <Check className="size-3 text-brand-stratus-blue" />
                              ) : null}
                            </span>
                            <div>
                              <div className="font-semibold">Festive gifting</div>
                              <div className="text-[11px] text-brand-ink-faint">Diwali and seasonal boxes</div>
                            </div>
                          </DropdownMenuItem>
                          {detectedOccasion?.type ? (
                            <DropdownMenuItem
                              className="text-[12px]"
                              closeOnClick={false}
                              onClick={() => setSelectedOccasion("account_event")}
                            >
                              <span className="w-3 shrink-0">
                                {selectedOccasion === "account_event" ? (
                                  <Check className="size-3 text-brand-stratus-blue" />
                                ) : null}
                              </span>
                              <div>
                                <div className="font-semibold">Account event</div>
                                <div className="text-[11px] text-brand-ink-faint">
                                  {detectedOccasion.timing === "upcoming" ? "Upcoming: " : ""}
                                  {detectedOccasion.label ?? detectedOccasion.type}
                                </div>
                              </div>
                            </DropdownMenuItem>
                          ) : null}
                          {WRITE_THEME_OCCASIONS.map((occasion) => (
                            <DropdownMenuItem
                              key={occasion.id}
                              className="text-[12px]"
                              closeOnClick={false}
                              onClick={() => setSelectedOccasion(occasion.id)}
                            >
                              <span className="w-3 shrink-0">
                                {selectedOccasion === occasion.id ? (
                                  <Check className="size-3 text-brand-stratus-blue" />
                                ) : null}
                              </span>
                              <div>
                                <div className="font-semibold">{occasion.label}</div>
                                <div className="text-[11px] text-brand-ink-faint">{occasion.pitch}</div>
                              </div>
                            </DropdownMenuItem>
                          ))}
                        </>
                      ) : null}
                      <DropdownMenuSeparator />
                    </>
                  ) : null}
                  <DropdownMenuItem
                    disabled={!canWrite || generating}
                    onClick={() => {
                      setWriteOptionsOpen(false);
                      void handleGenerate();
                    }}
                    className={cn(
                      "mt-0.5 justify-center rounded-full px-3 py-2 text-[12px] font-semibold",
                      canWrite && !generating
                        ? "ish-scout-cta-blue focus:bg-brand-stratus-blue focus:text-white"
                        : "ish-scout-cta-muted",
                    )}
                  >
                    <FileText className="size-3.5" />
                    {regenerateLabel}
                    {writeCredits > 0 && !generating ? (
                      <span className="font-medium opacity-75">· {writeCredits} cr</span>
                    ) : null}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : null}
          {composeActions ? (
            <>
              <ToolbarRule />
              {composeActions.viewInEmailOnly ? (
                <Link
                  href="/email?tab=active"
                  className="ish-scout-cta-blue inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-3 text-[11px] font-semibold hover:opacity-95"
                >
                  <Mail className="size-3" />
                  View in Email
                </Link>
              ) : (
                <>
                  {composeActions.dirty ? (
                    <span className="hidden px-1 text-[10px] font-medium text-amber-800 sm:inline">Unsaved</span>
                  ) : null}
                  {composeActions.showSave ? (
                    <button
                      type="button"
                      onClick={() => approvalRef.current?.save()}
                      disabled={!composeActions.canSave || draftSaving}
                      className="ish-scout-ghost inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-2.5 text-[11px] font-semibold transition-opacity hover:opacity-95 disabled:opacity-50"
                    >
                      {composeActions.saving ? <Loader2 className="size-3 animate-spin" /> : <Save className="size-3" />}
                      {composeActions.saving ? "Saving…" : "Save"}
                    </button>
                  ) : (
                    <Link
                      href="/email?tab=active"
                      className="ish-scout-ghost inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-2.5 text-[11px] font-semibold hover:opacity-95"
                    >
                      <Mail className="size-3" />
                      Queue
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={() => approvalRef.current?.send()}
                    disabled={!composeActions.canSend}
                    className={cn(
                      "inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-3 text-[11px] font-semibold transition-opacity",
                      composeActions.canSend ? "ish-scout-cta-blue hover:opacity-95" : "ish-scout-cta-muted",
                    )}
                  >
                    {composeActions.sending ? <Loader2 className="size-3 animate-spin" /> : <Send className="size-3" />}
                    {composeActions.sending ? "Sending…" : composeActions.sendLabel}
                  </button>
                </>
              )}
            </>
          ) : null}
        </>
      ) : phase === "reply_sent" ? (
        <>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={advancing}
            className="ish-scout-cta-blue h-7 shrink-0 rounded-full px-3 text-[11px] font-semibold hover:opacity-95 disabled:opacity-40"
            onClick={() => void handleMarkTastingSent()}
          >
            {advancing ? "Updating…" : "Mark tasting sent"}
          </Button>
          <Link
            href="/email?tab=active"
            className="ish-scout-ghost inline-flex h-7 shrink-0 items-center rounded-full px-3 text-[11px] font-semibold hover:opacity-95"
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
            ref={approvalRef}
            key={`${lead.id}-${resolvedDraft.id}`}
            draft={resolvedDraft}
            leadId={lead.id}
            leadStatus={lead.status}
            contactName={lead.name}
            companyName={lead.company}
            contactEmail={lead.email}
            contactEmails={lead.emails}
            selectedEmails={sequenceRecipients}
            onSelectedEmailsChange={setSequenceRecipients}
            chosenSubjectKey={sequenceSubjectKey}
            onChosenSubjectKeyChange={
              resolvedDraft.sequencePosition === 1 || resolvedDraft.sequencePosition == null
                ? handleSequenceSubjectKey
                : undefined
            }
            emailThread={thread}
            onDraftUpdated={(d) => {
              setActiveDraft(d);
              onDraftUpdated(d);
            }}
            onSavingChange={setDraftSaving}
            onComposeActionsChange={setComposeActions}
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
              ? `AI Writer will draft a 3-email sequence for ${lead.name || "this contact"} using research and brand context. Pick a template above, then click Write smart emails.`
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

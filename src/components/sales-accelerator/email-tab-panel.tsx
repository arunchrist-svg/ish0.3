"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, FileText, Loader2, Mail, Plus, Redo2, Send, Sparkles, Undo2 } from "lucide-react";
import { Button } from "@/design-system";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  runWriterSequence,
  runReplyWriter,
  runWriterStream,
  updateLeadStatus,
  regenerateSequenceStep,
  updateOutreachDraft,
  createBlankOutreachSequence,
  ensureCatalogOnOpenDraftClient,
  ensureBlankReplyDraftClient,
  type WriterMode,
} from "@/lib/api-client";
import { useIsMobileLayout } from "@/hooks/use-media-query";
import { scoreSpamMeter } from "@/lib/agents/writer-scoring";
import type { LeadDetailRecord, WriterDraft } from "@/lib/api-client";
import { isContactReadyStage } from "@/lib/pipeline-status";
import { asVariantKey, isSequenceFollowUpDraft, type VariantKey } from "@/lib/email/draft-variants";
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
  defaultReplyRecipientEmails,
  defaultSelectedContactEmails,
  EMPTY_SEND_TO_HINT,
  lastOutboundRecipientEmail,
  REPLY_EMPTY_SEND_TO_HINT,
  retainSelectedRecipientEmails,
} from "@/lib/outreach/send-recipients";
import { sanitizeEmail } from "@/lib/enrichment/validate-contact";
import { OutreachJourneyPanel } from "./outreach-journey-panel";
import { ConversationTimeline } from "./conversation-timeline";
import { SequenceControlButtons } from "./sequence-control-buttons";
import { SyncRepliesButton } from "./sync-replies-button";
import {
  CATALOG_ON_OPEN_SEQUENCE_POSITION,
  IF_OPENED_NODE_ID,
  isCatalogOnOpenDraft,
  isIshFestiveCatalogBody,
} from "@/lib/email/ish-festive-catalog";
import { IF_REPLIED_NODE_ID } from "@/lib/email/blank-reply-constants";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Props = {
  lead: LeadDetailRecord;
  draft?: WriterDraft;
  onDraftUpdated: (draft: WriterDraft, sequence?: WriterDraft[]) => void;
  onSilentRefresh: (opts?: { replaceOutreach?: boolean; clearOutreach?: boolean }) => void;
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
    if (isReplyLead && (phase === "drafting_reply" || phase === "they_replied")) {
      setSelectedNodeId(IF_REPLIED_NODE_ID);
    }
  }, [isReplyLead, phase, lead.id]);

  // When they reply, open a blank reply draft so the user can write the body.
  useEffect(() => {
    if (!needsReplyDraft) return;
    let cancelled = false;
    void ensureBlankReplyDraftClient({ leadId: lead.id })
      .then(({ draft: blank, drafts }) => {
        if (cancelled) return;
        setActiveDraft(blank);
        onDraftUpdated(blank, drafts);
        setSelectedNodeId(IF_REPLIED_NODE_ID);
        onSilentRefresh();
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [needsReplyDraft, lead.id, onDraftUpdated, onSilentRefresh]);

  useEffect(() => {
    setActiveDraft(draft);
  }, [draft, lead.id]);

  useEffect(() => {
    if (!draft && !(lead.outreachSequence?.length)) {
      setSelectedNodeId(undefined);
      setComposeActions(null);
    }
  }, [draft, lead.outreachSequence?.length, lead.id]);

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
    const e1 = sequence.find((d) => d.sequencePosition === 1);
    setSequenceSubjectKey(asVariantKey(e1?.chosenSubjectKey ?? draft?.chosenSubjectKey));
  }, [lead.id]);

  useEffect(() => {
    setSelectedOccasion(taggedOccasion ?? (detectedOccasion?.type ? detectedOccasion.type : FESTIVE_OCCASION_SENTINEL));
  }, [lead.id, taggedOccasion, detectedOccasion?.type]);

  // Existing sequences may predate If Opened. Create the A/B catalogue draft on demand.
  useEffect(() => {
    if (selectedNodeId !== IF_OPENED_NODE_ID) return;
    if (sequence.some((d) => isCatalogOnOpenDraft(d))) return;
    if (!sequence.some((d) => d.sequencePosition === 1)) return;
    let cancelled = false;
    void ensureCatalogOnOpenDraftClient({ leadId: lead.id })
      .then(({ draft: catalogDraft, drafts }) => {
        if (cancelled) return;
        setActiveDraft(catalogDraft);
        onDraftUpdated(catalogDraft, drafts);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [selectedNodeId, sequence, lead.id, onDraftUpdated]);

  const selectedNode = thread?.barNodes.find((n) => n.id === selectedNodeId);
  const selectedEvent = thread?.events.find((e) => e.id === selectedNodeId);

  const resolvedDraft = useMemo(() => {
    if (
      selectedNodeId === "reply-draft" ||
      selectedNodeId === IF_REPLIED_NODE_ID ||
      selectedEvent?.label === "Your reply"
    ) {
      return replyDraft;
    }
    if (selectedNodeId === IF_OPENED_NODE_ID) {
      return sequence.find((d) => isCatalogOnOpenDraft(d));
    }
    if (isReplyLead) {
      if (selectedNode?.outreachId && replyDraft?.id === selectedNode.outreachId) return replyDraft;
      if (selectedEvent?.kind === "inbound_reply") return replyDraft;
      return replyDraft;
    }
    if (selectedNodeId?.startsWith("draft-")) {
      const pos = Number(selectedNodeId.replace("draft-", ""));
      const fromSequence = sequence.find((d) => d.sequencePosition === pos);
      if (fromSequence) return fromSequence;
    }
    if (selectedNode?.outreachId) {
      if (activeDraft?.id === selectedNode.outreachId) return activeDraft;
      const fromSequence = sequence.find((d) => d.id === selectedNode.outreachId);
      if (fromSequence) return fromSequence;
      if (draft?.id === selectedNode.outreachId) return draft;
    }
    return activeDraft ?? draft;
  }, [selectedNode, selectedNodeId, selectedEvent, sequence, activeDraft, draft, isReplyLead, replyDraft]);

  useEffect(() => {
    const lastSent = lastOutboundRecipientEmail(thread?.events ?? [], thread?.barNodes);
    const laterSequence = isSequenceFollowUpDraft(resolvedDraft?.sequencePosition);
    const reuseThreadTo = isReplyDraft || isReplyLead || laterSequence;
    const defaults = reuseThreadTo
      ? defaultReplyRecipientEmails(lead.email, lead.emails, lastSent)
      : defaultSelectedContactEmails(lead.email, lead.emails);
    const listed = [
      lead.email,
      lastSent,
      ...(lead.emails ?? []).map((e) => e.email),
    ].filter((e): e is string => Boolean(e));
    setSequenceRecipients((prev) =>
      retainSelectedRecipientEmails(prev, listed, new Set(), defaults, {
        allowAlreadySent: reuseThreadTo,
      }),
    );
  }, [
    lead.id,
    lead.email,
    lead.emails,
    isReplyDraft,
    isReplyLead,
    resolvedDraft?.sequencePosition,
    thread?.events,
    thread?.barNodes,
  ]);

  const contentQuality = useMemo(() => {
    if (!resolvedDraft?.emailBody) return null;
    return scoreSpamMeter(resolvedDraft.emailBody, resolvedDraft.subjectA ?? "", {
      contactFirstName: lead.firstName,
      sequencePosition: resolvedDraft.sequencePosition ?? 1,
      allowLongCatalog:
        isCatalogOnOpenDraft(resolvedDraft) || isIshFestiveCatalogBody(resolvedDraft.emailBody),
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
  const selectingEditableDraft =
    selectedNode?.kind === "draft" ||
    selectedNode?.kind === "reply_draft" ||
    selectedNode?.kind === "scheduled" ||
    selectedNodeId === "reply-draft" ||
    selectedNodeId === IF_REPLIED_NODE_ID ||
    selectedNodeId === IF_OPENED_NODE_ID ||
    selectedNodeId?.startsWith("draft-") ||
    selectedEvent?.status === "draft" ||
    selectedEvent?.status === "scheduled";
  const isEditableNode =
    isEmptyCompose ||
    selectingEditableDraft ||
    thread?.barMode === "drafts" ||
    (thread?.barMode === "reply" && isReplyDraft) ||
    (isReplyLead && Boolean(replyDraft) && phase !== "reply_sent");
  const showComposeZone =
    isEditableNode ||
    thread?.showComposeZone ||
    (hasDraft && phase !== "reply_sent" && phase !== "complete") ||
    (isReplyLead && phase !== "reply_sent") ||
    needsReplyDraft;
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
    hasDraft &&
    (phase === "compose" ||
      thread?.barMode === "drafts" ||
      thread?.barMode === "hidden" ||
      thread?.barMode === "sequence");

  const sequenceState = thread?.sequenceState ?? "not_started";
  /** First-write empty: keep Pick inbox only; Start + template belong after drafts exist. */
  const showSequenceControls = !isEmptyCompose;
  const showSyncReplies = lead.status === "outreached" || phase === "awaiting_reply";

  async function handleGenerate() {
    setGenerating(true);
      setGeneratingLabel(writerMode === "ai" ? "Writing Email 1 of 3" : "Draft 1 of 3");
    try {
      if (isReplyLead) {
        const newDraft = await runReplyWriter(lead.id);
        setActiveDraft(newDraft);
        onDraftUpdated(newDraft);
        setSelectedNodeId(IF_REPLIED_NODE_ID);
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
        onSilentRefresh({ replaceOutreach: true });
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
      onSilentRefresh({ replaceOutreach: true });
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

  async function handleWriteYourself() {
    setGenerating(true);
    setGeneratingLabel("Opening blank drafts");
    try {
      const { draft: first, drafts } = await createBlankOutreachSequence({
        leadId: lead.id,
        outreachTemplate: selectedTemplate,
      });
      setActiveDraft(first);
      setSequenceSubjectKey(asVariantKey(first.chosenSubjectKey));
      onDraftUpdated(first, drafts);
      setSelectedNodeId("draft-1");
      onSilentRefresh({ replaceOutreach: true });
      toast.success("Blank drafts ready. Write Email 1 yourself.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start blank drafts");
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
      setSelectedNodeId(IF_REPLIED_NODE_ID);
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
      .filter((d) => d.templateVariant !== "reply" && !isCatalogOnOpenDraft(d))
      .map((d) => d.id);
    void Promise.all(
      ids.map((leadOutreachId) => updateOutreachDraft({ leadOutreachId, chosenSubjectKey: key })),
    ).catch(() => {
      toast.error("Could not save the subject choice for all emails");
    });
  }

  function handleNodeSelect(nodeId: string) {
    setSelectedNodeId(nodeId);
    if (nodeId === "reply-draft" || nodeId === IF_REPLIED_NODE_ID) {
      if (!isReplyLead) {
        toast.message("Reply opens on the bar after they reply, with an empty body for you to write.");
        return;
      }
      if (replyDraft) {
        setActiveDraft(replyDraft);
        composeRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      void ensureBlankReplyDraftClient({ leadId: lead.id })
        .then(({ draft: blank, drafts }) => {
          setActiveDraft(blank);
          onDraftUpdated(blank, drafts);
          setSelectedNodeId(IF_REPLIED_NODE_ID);
          onSilentRefresh();
          composeRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        })
        .catch((e) => {
          toast.error(e instanceof Error ? e.message : "Could not open blank reply");
        });
      return;
    }
    if (nodeId === IF_OPENED_NODE_ID || nodeId === `draft-${CATALOG_ON_OPEN_SEQUENCE_POSITION}`) {
      const existing = sequence.find((s) => isCatalogOnOpenDraft(s));
      if (existing) {
        setActiveDraft(existing);
        composeRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      void ensureCatalogOnOpenDraftClient({ leadId: lead.id })
        .then(({ draft: catalogDraft, drafts }) => {
          setActiveDraft(catalogDraft);
          onDraftUpdated(catalogDraft, drafts);
          composeRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        })
        .catch((e) => {
          toast.error(e instanceof Error ? e.message : "Could not load If Opened draft");
        });
      return;
    }
    if (nodeId.startsWith("draft-")) {
      const pos = Number(nodeId.replace("draft-", ""));
      const d = sequence.find((s) => s.sequencePosition === pos);
      if (d) setActiveDraft(d);
      composeRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    const node = thread?.barNodes.find((n) => n.id === nodeId);
    if (node?.outreachId) {
      const d = sequence.find((s) => s.id === node.outreachId) ?? (draft?.id === node.outreachId ? draft : undefined);
      if (d) {
        setActiveDraft(d);
      }
    }
    if (node?.kind === "draft" || node?.kind === "reply_draft" || node?.kind === "scheduled") {
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
    writerMode === "ai" ? "AI" : "Std",
    activeTemplate.shortLabel,
  ]
    .filter(Boolean)
    .join(" · ");

  const writerModeHint =
    writerMode === "ai"
      ? "Writes with research and brand context"
      : "Personalizes with name and company";
  const accountEventHint = detectedOccasion?.type
    ? `${detectedOccasion.timing === "upcoming" ? "Upcoming: " : ""}${detectedOccasion.label ?? detectedOccasion.type}`
    : "Account event";

  function writeOptionClass(selected: boolean) {
    return cn(
      "gap-2 py-1.5 text-[12px] font-semibold text-brand-ink",
      selected && "bg-brand-stratus-blue/[0.07]",
    );
  }

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
    const lastSent = lastOutboundRecipientEmail(thread?.events ?? [], thread?.barNodes);
    if (lastSent) add(lastSent, "Thread");
    for (const email of sequenceRecipients) {
      add(email, "Added");
    }
    return out;
  }, [lead.email, lead.emails, sentEmailKeys, sequenceRecipients, thread?.events, thread?.barNodes]);

  const isLaterSequenceDraft =
    resolvedDraft?.sequencePosition === 2 || resolvedDraft?.sequencePosition === 3;
  const reuseThreadRecipient = isReplyDraft || isReplyLead || isLaterSequenceDraft;
  const needsInboxPick = sequenceRecipients.length === 0;
  const showRecipientControl =
    showProcessBar &&
    (isEmptyCompose ? needsInboxPick : !isLaterSequenceDraft || needsInboxPick);
  /** Typed add-email row: after a draft exists, or when Pick inbox has nothing listed / user is typing. */
  const showAddRecipientField =
    !isEmptyCompose || recipientOptions.length === 0 || Boolean(extraRecipient.trim());
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
    if (!reuseThreadRecipient && sentEmailKeys.has(email.trim().toLowerCase())) return;
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
                "ish-scout-ghost inline-flex h-7 max-w-[10rem] shrink-0 items-center gap-1 rounded-full px-2 text-[11px] font-semibold text-brand-ink outline-none transition-all",
                "hover:opacity-95 focus-visible:ring-2 focus-visible:ring-brand-stratus-blue/25",
                needsInboxPick && "ring-2 ring-brand-stratus-blue/30",
              )}
            >
              <Mail className="size-3 shrink-0 text-brand-stratus-blue" />
              <span className="truncate" title={recipientTriggerLabel}>{recipientTriggerLabel}</span>
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
                    disabled={entry.sent && !reuseThreadRecipient}
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
                        {entry.sent && !reuseThreadRecipient
                          ? "Already sent"
                          : entry.sent && reuseThreadRecipient
                            ? "Original To"
                            : entry.label ?? "Inbox"}
                      </div>
                    </div>
                  </DropdownMenuItem>
                );
              })
              ) : (
                <p className="px-2 py-1 text-[11px] text-brand-ink-soft">No saved inboxes yet.</p>
              )}
              {showAddRecipientField ? (
                <>
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
                </>
              ) : null}
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
          {draftingReply ? "Writing…" : "Write smart reply"}
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
      {showSequenceControls ? (
        <SequenceControlButtons
          leadId={lead.id}
          sequenceState={sequenceState}
          disabled={generating}
          sending={composeActions?.sending}
          onUpdated={(meta) => {
            if (meta?.action === "reset") {
              setActiveDraft(undefined);
              setSelectedNodeId(undefined);
              setComposeActions(null);
              setSequenceSubjectKey("A");
              onSilentRefresh({ replaceOutreach: true, clearOutreach: true });
              return;
            }
            onSilentRefresh();
          }}
          hideStart={Boolean(composeActions && !composeActions.viewInEmailOnly)}
          onStartSequence={async () => {
            composeRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
            if (approvalRef.current && composeActions && !composeActions.viewInEmailOnly) {
              if (composeActions.sending) return;
              if (!composeActions.canSend) {
                if (!sequenceRecipients.length) {
                  toast.error(
                    reuseThreadRecipient ? REPLY_EMPTY_SEND_TO_HINT : EMPTY_SEND_TO_HINT,
                  );
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
      ) : null}
      {showProcessBar ? (
        <>
          {showWriterControl ? (
            <DropdownMenu modal={false} open={writeOptionsOpen} onOpenChange={setWriteOptionsOpen}>
                <DropdownMenuTrigger
                  disabled={!canWrite || generating}
                  className={cn(
                    "ish-scout-ghost inline-flex h-7 max-w-[8.5rem] shrink-0 items-center gap-1 rounded-full px-2 text-[11px] font-semibold text-brand-ink outline-none transition-all",
                    "hover:opacity-95 focus-visible:ring-2 focus-visible:ring-brand-stratus-blue/25 disabled:cursor-not-allowed disabled:opacity-40",
                  )}
                >
                  <span className="truncate" title={writeOptionsSummary}>{writeOptionsSummary}</span>
                  <ChevronDown className="size-3 shrink-0 text-brand-ink-faint" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="ish-email-write-menu w-[min(100vw-2rem,240px)] rounded-[16px] p-1.5">
                  {!isReplyLead && showRegenerate ? (
                    <>
                      <DropdownMenuLabel className="px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-brand-ink-faint">
                        Writer
                      </DropdownMenuLabel>
                      <DropdownMenuItem
                        className={writeOptionClass(writerMode === "standard")}
                        title="Personalizes templates with name and company"
                        closeOnClick={false}
                        onClick={() => setWriterMode("standard")}
                      >
                        <span className="flex w-3 shrink-0 justify-center">
                          {writerMode === "standard" ? <Check className="size-3 text-brand-stratus-blue" /> : null}
                        </span>
                        Standard
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className={writeOptionClass(writerMode === "ai")}
                        title="Writes with AI using research and brand context"
                        closeOnClick={false}
                        onClick={() => setWriterMode("ai")}
                      >
                        <span className="flex w-3 shrink-0 justify-center">
                          {writerMode === "ai" ? <Check className="size-3 text-brand-stratus-blue" /> : null}
                        </span>
                        AI Writer
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel className="px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-brand-ink-faint">
                        Template
                      </DropdownMenuLabel>
                      {templates.map((template) => (
                        <DropdownMenuItem
                          key={template.id}
                          className={writeOptionClass(selectedTemplate === template.id)}
                          title={template.description}
                          closeOnClick={false}
                          onClick={() => setSelectedTemplate(template.id)}
                        >
                          <span className="flex w-3 shrink-0 justify-center">
                            {selectedTemplate === template.id ? (
                              <Check className="size-3 text-brand-stratus-blue" />
                            ) : null}
                          </span>
                          {template.label}
                        </DropdownMenuItem>
                      ))}
                      {showOccasionPicker ? (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuLabel className="px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-brand-ink-faint">
                            Occasion
                          </DropdownMenuLabel>
                          <div className="max-h-[min(40vh,14.5rem)] overflow-y-auto overscroll-contain">
                            <DropdownMenuItem
                              className={writeOptionClass(selectedOccasion === FESTIVE_OCCASION_SENTINEL)}
                              title="Diwali and seasonal boxes"
                              closeOnClick={false}
                              onClick={() => setSelectedOccasion(FESTIVE_OCCASION_SENTINEL)}
                            >
                              <span className="flex w-3 shrink-0 justify-center">
                                {selectedOccasion === FESTIVE_OCCASION_SENTINEL ? (
                                  <Check className="size-3 text-brand-stratus-blue" />
                                ) : null}
                              </span>
                              Festive gifting
                            </DropdownMenuItem>
                            {detectedOccasion?.type ? (
                              <DropdownMenuItem
                                className={writeOptionClass(selectedOccasion === "account_event")}
                                title={accountEventHint}
                                closeOnClick={false}
                                onClick={() => setSelectedOccasion("account_event")}
                              >
                                <span className="flex w-3 shrink-0 justify-center">
                                  {selectedOccasion === "account_event" ? (
                                    <Check className="size-3 text-brand-stratus-blue" />
                                  ) : null}
                                </span>
                                Account event
                              </DropdownMenuItem>
                            ) : null}
                            {WRITE_THEME_OCCASIONS.map((occasion) => (
                              <DropdownMenuItem
                                key={occasion.id}
                                className={writeOptionClass(selectedOccasion === occasion.id)}
                                title={occasion.pitch}
                                closeOnClick={false}
                                onClick={() => setSelectedOccasion(occasion.id)}
                              >
                                <span className="flex w-3 shrink-0 justify-center">
                                  {selectedOccasion === occasion.id ? (
                                    <Check className="size-3 text-brand-stratus-blue" />
                                  ) : null}
                                </span>
                                {occasion.label}
                              </DropdownMenuItem>
                            ))}
                          </div>
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
          ) : null}
          {composeActions ? (
            composeActions.viewInEmailOnly ? (
              <Link
                href="/email?tab=active"
                className="ish-scout-cta-blue inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-3 text-[11px] font-semibold hover:opacity-95"
              >
                <Mail className="size-3" />
                View in Email
              </Link>
            ) : (
              <div className="inline-flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  disabled={!composeActions.canUndo}
                  onClick={() => approvalRef.current?.undo()}
                  title="Undo (⌘Z / Ctrl+Z)"
                  aria-label="Undo"
                  className="inline-flex size-7 items-center justify-center rounded-full text-brand-ink-soft transition-colors hover:bg-black/[0.04] hover:text-brand-ink disabled:cursor-default disabled:opacity-35"
                >
                  <Undo2 className="size-3.5" />
                </button>
                <button
                  type="button"
                  disabled={!composeActions.canRedo}
                  onClick={() => approvalRef.current?.redo()}
                  title="Redo (⌘⇧Z / Ctrl+Y)"
                  aria-label="Redo"
                  className="inline-flex size-7 items-center justify-center rounded-full text-brand-ink-soft transition-colors hover:bg-black/[0.04] hover:text-brand-ink disabled:cursor-default disabled:opacity-35"
                >
                  <Redo2 className="size-3.5" />
                </button>
                <span className="mx-0.5 text-[11px] font-medium text-brand-ink-faint" aria-hidden>
                  |
                </span>
                <button
                  type="button"
                  onClick={() => approvalRef.current?.send()}
                  disabled={!composeActions.canSend}
                  className={cn(
                    "inline-flex h-7 min-w-[4.5rem] shrink-0 items-center justify-center gap-1 rounded-full px-3 text-[11px] font-semibold transition-opacity",
                    composeActions.canSend ? "ish-scout-cta-blue hover:opacity-95" : "ish-scout-cta-muted",
                  )}
                >
                  {composeActions.sending ? <Loader2 className="size-3 animate-spin" /> : <Send className="size-3" />}
                  {composeActions.sending ? "Sending…" : composeActions.sendLabel}
                </button>
              </div>
            )
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

  const hasToolbarActions =
    !isEmptyCompose &&
    (showRecipientControl ||
      (isReplyLead && phase !== "reply_sent") ||
      showSyncReplies ||
      showSequenceControls ||
      (showProcessBar && showWriterControl) ||
      (showProcessBar && Boolean(composeActions)) ||
      phase === "reply_sent");

  return (
    <div className="ish-email-tab animate-brand-tab-in min-w-0 space-y-2 overflow-hidden px-0 py-1 lg:space-y-2.5 lg:px-[22px] lg:py-2">
      {!isEmptyCompose ? (
        <OutreachJourneyPanel
          thread={thread}
          processActions={hasToolbarActions ? processActions : undefined}
          selectedNodeId={selectedNodeId}
          onNodeSelect={handleNodeSelect}
        />
      ) : null}

      {/* Status; after a reply, offer an empty-body compose path from the bar. */}
      {isReplyLead && phase !== "reply_sent" ? (
        <div className="flex min-h-7 items-center justify-between gap-2 rounded-[10px] border border-brand-stratus-blue/10 bg-white/80 px-2.5 py-1">
          <p className="min-w-0 truncate text-[12px] leading-snug text-brand-ink">
            <span className="font-semibold">They replied</span>
            <span className="font-normal text-brand-ink-soft">
              {" "}
              · Empty body ready. Write your reply
              {showWriterControl ? ", or use Write smart reply" : ""}.
            </span>
          </p>
          <button
            type="button"
            onClick={() => handleNodeSelect(IF_REPLIED_NODE_ID)}
            className="ish-scout-ghost shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold"
          >
            Open reply
          </button>
        </div>
      ) : thread?.nextStep &&
        (thread.events?.length ?? 0) > 0 &&
        !needsReplyDraft &&
        phase !== "drafting_reply" ? (
        <div className="flex min-h-7 items-center rounded-[10px] border border-brand-stratus-blue/10 bg-white/80 px-2.5 py-1">
          <p className="min-w-0 truncate text-[12px] leading-snug text-brand-ink">
            <span className="font-semibold">{thread.nextStep.title}</span>
            {thread.nextStep.description ? (
              <span className="font-normal text-brand-ink-soft">
                {" "}
                · {thread.nextStep.description}
              </span>
            ) : null}
          </p>
        </div>
      ) : null}

      {generating ? (
        <div className="border-y border-brand-border bg-white py-10 lg:mx-0 lg:rounded-[20px] lg:border lg:py-12 lg:shadow-[var(--shadow-brand-sm)]">
          {streamMessage ? (
            <div className="mx-3 rounded-xl bg-brand-yellow-soft px-3 py-2.5 text-[13px] font-medium text-brand-ink lg:mx-4 lg:px-4 lg:py-3">
              {streamMessage}
            </div>
          ) : null}
          <WritingLoader
            contactName={lead.name}
            companyName={lead.company}
            sequenceLabel={generatingLabel}
          />
        </div>
      ) : draftingReply ? (
        <div className="border-y border-brand-border bg-white py-10 lg:rounded-[20px] lg:border lg:py-12 lg:shadow-[var(--shadow-brand-sm)]">
          <WritingLoader contactName={lead.name} companyName={lead.company} sequenceLabel="Drafting reply" />
        </div>
      ) : (
        <>
          <ConversationTimeline
            thread={thread}
            selectedEventId={selectedNodeId}
            onSelect={handleNodeSelect}
            hideDraftEvents={Boolean(
              (showComposeZone && isEditableNode && resolvedDraft && !needsReplyDraft) ||
                selectedNodeId === IF_OPENED_NODE_ID,
            )}
          />

          {isEmptyCompose && !generating ? (
            <div className="space-y-3 px-3 py-3 lg:px-0 lg:py-4">
              <div className="flex justify-center">
              <div className="w-full max-w-[22rem] overflow-hidden rounded-[14px] border border-black/[0.08] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.06)]">
                <div className="space-y-3 px-4 py-3">
                  <div className="space-y-1.5">
                    <p className="text-[12px] font-medium text-brand-ink">Template</p>
                    <DropdownMenu modal={false}>
                      <DropdownMenuTrigger
                        disabled={!canWrite || generating}
                        className={cn(
                          "flex h-9 w-full items-center justify-between gap-2 rounded-[10px] border border-black/[0.08] bg-[#f5f5f7] px-3 text-left text-[13px] font-semibold text-brand-ink outline-none",
                          "hover:bg-[#ebebed] focus-visible:ring-2 focus-visible:ring-brand-stratus-blue/25 disabled:opacity-40",
                        )}
                      >
                        <span className="min-w-0 truncate">{activeTemplate.label}</span>
                        <ChevronDown className="size-3.5 shrink-0 text-brand-ink-faint" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="start"
                        className="ish-email-write-menu w-[min(100vw-2rem,20rem)] rounded-[14px] p-1.5"
                      >
                        {templates.map((template) => (
                          <DropdownMenuItem
                            key={template.id}
                            className={writeOptionClass(selectedTemplate === template.id)}
                            title={template.description}
                            onClick={() => setSelectedTemplate(template.id)}
                          >
                            <span className="flex w-3 shrink-0 justify-center">
                              {selectedTemplate === template.id ? (
                                <Check className="size-3 text-brand-stratus-blue" />
                              ) : null}
                            </span>
                            {template.label}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <p className="text-[11px] leading-snug text-brand-ink-faint">{activeTemplate.description}</p>
                  </div>

                  <div className="space-y-1.5">
                    <p className="text-[12px] font-medium text-brand-ink">Writer</p>
                    <div
                      role="radiogroup"
                      aria-label="Writer"
                      className="grid grid-cols-2 gap-1 rounded-[10px] bg-[#f5f5f7] p-1"
                    >
                      {(["standard", "ai"] as const).map((mode) => {
                        const checked = writerMode === mode;
                        return (
                          <button
                            key={mode}
                            type="button"
                            role="radio"
                            aria-checked={checked}
                            disabled={!canWrite || generating}
                            onClick={() => setWriterMode(mode)}
                            className={cn(
                              "rounded-[8px] px-3 py-1.5 text-[13px] font-semibold transition-all disabled:opacity-40",
                              checked
                                ? "bg-white text-brand-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]"
                                : "text-brand-ink-soft hover:text-brand-ink",
                            )}
                          >
                            {mode === "standard" ? "Standard" : "AI"}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[11px] leading-snug text-brand-ink-faint">{writerModeHint}</p>
                  </div>

                  {selectedTemplate === "gift_sampling" ? (
                    <div className="space-y-1.5">
                      <p className="text-[12px] font-medium text-brand-ink">Occasion</p>
                      <DropdownMenu modal={false}>
                        <DropdownMenuTrigger
                          disabled={!canWrite || generating}
                          className={cn(
                            "flex h-9 w-full items-center justify-between gap-2 rounded-[10px] border border-black/[0.08] bg-[#f5f5f7] px-3 text-left text-[13px] font-semibold text-brand-ink outline-none",
                            "hover:bg-[#ebebed] focus-visible:ring-2 focus-visible:ring-brand-stratus-blue/25 disabled:opacity-40",
                          )}
                        >
                          <span className="min-w-0 truncate">{selectedOccasionDef.label}</span>
                          <ChevronDown className="size-3.5 shrink-0 text-brand-ink-faint" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="start"
                          className="ish-email-write-menu w-[min(100vw-2rem,20rem)] rounded-[14px] p-1.5"
                        >
                          <div className="max-h-[min(40vh,14.5rem)] overflow-y-auto overscroll-contain">
                            <DropdownMenuItem
                              className={writeOptionClass(selectedOccasion === FESTIVE_OCCASION_SENTINEL)}
                              title="Diwali and seasonal boxes"
                              onClick={() => setSelectedOccasion(FESTIVE_OCCASION_SENTINEL)}
                            >
                              <span className="flex w-3 shrink-0 justify-center">
                                {selectedOccasion === FESTIVE_OCCASION_SENTINEL ? (
                                  <Check className="size-3 text-brand-stratus-blue" />
                                ) : null}
                              </span>
                              Festive gifting
                            </DropdownMenuItem>
                            {detectedOccasion?.type ? (
                              <DropdownMenuItem
                                className={writeOptionClass(selectedOccasion === "account_event")}
                                title={accountEventHint}
                                onClick={() => setSelectedOccasion("account_event")}
                              >
                                <span className="flex w-3 shrink-0 justify-center">
                                  {selectedOccasion === "account_event" ? (
                                    <Check className="size-3 text-brand-stratus-blue" />
                                  ) : null}
                                </span>
                                Account event
                              </DropdownMenuItem>
                            ) : null}
                            {WRITE_THEME_OCCASIONS.map((occasion) => (
                              <DropdownMenuItem
                                key={occasion.id}
                                className={writeOptionClass(selectedOccasion === occasion.id)}
                                title={occasion.pitch}
                                onClick={() => setSelectedOccasion(occasion.id)}
                              >
                                <span className="flex w-3 shrink-0 justify-center">
                                  {selectedOccasion === occasion.id ? (
                                    <Check className="size-3 text-brand-stratus-blue" />
                                  ) : null}
                                </span>
                                {occasion.label}
                              </DropdownMenuItem>
                            ))}
                          </div>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <p className="text-[11px] leading-snug text-brand-ink-faint">
                        {selectedOccasion === FESTIVE_OCCASION_SENTINEL
                          ? "Diwali and seasonal boxes"
                          : selectedOccasion === "account_event"
                            ? accountEventHint
                            : selectedOccasionDef.pitch}
                      </p>
                    </div>
                  ) : null}
                </div>

                <div className="flex flex-col gap-1.5 border-t border-black/[0.06] px-4 py-3">
                  <button
                    type="button"
                    disabled={!canWrite || generating}
                    onClick={() => void handleGenerate()}
                    className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-[10px] bg-brand-black px-4 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                  >
                    <Sparkles className="size-3.5 shrink-0" />
                    Write smart emails
                    {writeCredits > 0 ? (
                      <span className="font-medium opacity-75">· {writeCredits} cr</span>
                    ) : null}
                  </button>
                  <button
                    type="button"
                    disabled={!canWrite || generating}
                    onClick={() => void handleWriteYourself()}
                    className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-[8px] text-[12px] font-semibold text-brand-ink-soft transition-colors hover:bg-black/[0.03] hover:text-brand-ink disabled:opacity-40"
                  >
                    <FileText className="size-3.5 shrink-0" />
                    Write yourself
                  </button>
                </div>
              </div>
              </div>
            </div>
          ) : null}

          {showComposeZone && isEditableNode && resolvedDraft && !needsReplyDraft ? (
            <div ref={composeRef} className="pt-1">
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
                chosenSubjectKey={
                  isCatalogOnOpenDraft(resolvedDraft) ? undefined : sequenceSubjectKey
                }
                onChosenSubjectKeyChange={
                  isCatalogOnOpenDraft(resolvedDraft)
                    ? undefined
                    : resolvedDraft.sequencePosition === 1 || resolvedDraft.sequencePosition == null
                      ? handleSequenceSubjectKey
                      : undefined
                }
                emailThread={thread}
                onDraftUpdated={(d) => {
                  setActiveDraft(d);
                  onDraftUpdated(d);
                }}
                onComposeActionsChange={setComposeActions}
                contentScore={contentQuality?.inboxScore ?? resolvedDraft.inboxScore ?? resolvedDraft.deliverabilityScore}
                onSent={onSent ?? onSilentRefresh}
                onSendFailed={onSilentRefresh}
                startSequenceDraft={
                  sequence.find((d) => d.sequencePosition === 1) ??
                  (resolvedDraft.sequencePosition === 1 ? resolvedDraft : undefined)
                }
              />
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
        </>
      )}
    </div>
  );
}

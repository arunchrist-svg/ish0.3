"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, ExternalLink, FileText, Loader2, Mail, MapPin, MessageSquarePlus, Phone, Redo2, Send, Sparkles, Undo2, UserRound, X } from "lucide-react";
import { Button } from "@/design-system";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConversationTimeline } from "@/components/sales-accelerator/conversation-timeline";
import {
  OutreachApprovalCard,
  type ComposeActionState,
  type OutreachApprovalHandle,
} from "@/components/sales-accelerator/outreach-approval-card";
import { ComposeSendButtons } from "@/components/sales-accelerator/compose-send-buttons";
import { SequenceControlButtons } from "@/components/sales-accelerator/sequence-control-buttons";
import { SyncRepliesButton } from "@/components/sales-accelerator/sync-replies-button";
import { WritingLoader } from "@/components/sales-accelerator/writing-loader";
import {
  applyWriterDraft,
  mergeLeadOutreachFromServer,
} from "@/lib/email/apply-writer-draft";
import { isEmail1SentInThread } from "@/lib/email/email-thread";
import {
  IF_OPENED_NODE_ID,
  isCatalogOnOpenDraft,
} from "@/lib/email/ish-festive-catalog";
import { isSequenceFollowUpDraft, isNonInitialSequenceDraft } from "@/lib/email/draft-variants";
import {
  ensureBlankReplyDraftClient,
  ensureCatalogOnOpenDraftClient,
  fetchLead,
  runReplyWriter,
  runWriterSequence,
  updateOutreachDraft,
  type LeadDetailRecord,
  type WriterDraft,
  type WriterMode,
} from "@/lib/api-client";
import { invalidateCached } from "@/lib/client-fetch-cache";
import {
  defaultReplyRecipientEmails,
  defaultSelectedContactEmails,
  EMPTY_SEND_TO_HINT,
  lastOutboundRecipientEmail,
  REPLY_EMPTY_SEND_TO_HINT,
} from "@/lib/outreach/send-recipients";
import { OUTREACH_TEMPLATES, type OutreachTemplateId } from "@/lib/email/outreach-templates";
import { getBoardTemplateOverride, setBoardTemplateOverride } from "@/lib/board-template-override";
import { AppModal } from "@/components/ui/app-modal";
import { LinkedInGlyph } from "@/components/icons/linkedin-glyph";
import { showError } from "@/lib/toast";
import { cn, personLinkedInHref } from "@/lib/utils";
import { toast } from "sonner";

export type OutreachComposeTab =
  | "needs_review"
  | "active"
  | "hot"
  | "replies"
  | "done"
  | "logs";

type Props = {
  leadId: string;
  /** Queue tab that opened the modal. Drives review vs reply mode. */
  tab?: OutreachComposeTab;
  /** Prefer this outreach draft when reviewing (from overview row). */
  draftOutreachId?: string | null;
  /** Pending follow-up schedule when reviewing a sequencer draft. */
  pendingFollowUpScheduleId?: string | null;
  isFollowUpReview?: boolean;
  onClose: () => void;
  onChanged?: () => void;
};

type ComposeMode = "review" | "reply";

type ReviewNodeId = "draft-1" | "draft-2" | "draft-3" | typeof IF_OPENED_NODE_ID;

type ReviewDraftTab = {
  id: ReviewNodeId;
  label: string;
  draft?: WriterDraft;
};

function findReplyDraft(lead: LeadDetailRecord): WriterDraft | undefined {
  const sequence = lead.outreachSequence ?? [];
  if (lead.outreach?.templateVariant === "reply") return lead.outreach;
  return sequence.find((d) => d.templateVariant === "reply");
}

function isOutreachDraft(d: WriterDraft): boolean {
  return d.templateVariant !== "reply" && !isCatalogOnOpenDraft(d);
}

function sequenceDraftAt(
  lead: LeadDetailRecord,
  position: number,
): WriterDraft | undefined {
  const fromSequence = (lead.outreachSequence ?? []).find(
    (d) => isOutreachDraft(d) && (d.sequencePosition ?? 1) === position,
  );
  if (fromSequence) return fromSequence;
  if (
    lead.outreach &&
    isOutreachDraft(lead.outreach) &&
    (lead.outreach.sequencePosition ?? 1) === position
  ) {
    return lead.outreach;
  }
  return undefined;
}

function catalogDraftFor(lead: LeadDetailRecord): WriterDraft | undefined {
  return (lead.outreachSequence ?? []).find((d) => isCatalogOnOpenDraft(d));
}

function reviewNodeIdForDraft(d: WriterDraft): ReviewNodeId {
  if (isCatalogOnOpenDraft(d)) return IF_OPENED_NODE_ID;
  const pos = d.sequencePosition ?? 1;
  if (pos === 2) return "draft-2";
  if (pos === 3) return "draft-3";
  return "draft-1";
}

/** Email 1 / 2 / 3 + If Opened tabs for Needs Review. */
function buildReviewDraftTabs(lead: LeadDetailRecord): ReviewDraftTab[] {
  const tabs: ReviewDraftTab[] = [];
  for (const pos of [1, 2, 3] as const) {
    const draft = sequenceDraftAt(lead, pos);
    if (draft) {
      tabs.push({ id: `draft-${pos}` as ReviewNodeId, label: `Email ${pos}`, draft });
    }
  }
  const email1 = sequenceDraftAt(lead, 1);
  const catalog = catalogDraftFor(lead);
  if (email1 || catalog) {
    tabs.push({ id: IF_OPENED_NODE_ID, label: "If Opened", draft: catalog });
  }
  return tabs;
}

function draftForReviewNode(
  lead: LeadDetailRecord,
  nodeId: ReviewNodeId,
): WriterDraft | undefined {
  if (nodeId === IF_OPENED_NODE_ID) return catalogDraftFor(lead);
  const pos = Number(nodeId.replace("draft-", ""));
  return sequenceDraftAt(lead, pos);
}

/** Email 1 or follow-up draft under review (Needs Review / draft_ready). */
function findReviewDraft(
  lead: LeadDetailRecord,
  draftOutreachId?: string | null,
): WriterDraft | undefined {
  const sequence = (lead.outreachSequence ?? []).filter(isOutreachDraft);
  const catalog = catalogDraftFor(lead);
  if (draftOutreachId) {
    const byId =
      sequence.find((d) => d.id === draftOutreachId) ??
      (catalog?.id === draftOutreachId ? catalog : undefined) ??
      (lead.outreach?.id === draftOutreachId && isOutreachDraft(lead.outreach)
        ? lead.outreach
        : undefined);
    if (byId) return byId;
  }

  if (lead.status === "draft_ready") {
    return (
      sequence.find((d) => d.sequencePosition === 1) ??
      (lead.outreach && isOutreachDraft(lead.outreach) ? lead.outreach : undefined) ??
      sequence[0]
    );
  }

  const followUps = sequence
    .filter((d) => (d.sequencePosition ?? 1) > 1)
    .sort((a, b) => (b.sequencePosition ?? 0) - (a.sequencePosition ?? 0));
  if (followUps[0]) return followUps[0];

  return (
    sequence.find((d) => d.sequencePosition === 1) ??
    (lead.outreach && isOutreachDraft(lead.outreach) ? lead.outreach : undefined) ??
    sequence[0]
  );
}

function resolveMode(
  tab: OutreachComposeTab | undefined,
  lead: LeadDetailRecord | null,
  isFollowUpReview?: boolean,
): ComposeMode {
  if (tab === "needs_review" || isFollowUpReview) return "review";
  if (lead?.status === "draft_ready") return "review";
  return "reply";
}

export function OutreachComposeModal({
  leadId,
  tab,
  draftOutreachId,
  pendingFollowUpScheduleId,
  isFollowUpReview,
  onClose,
  onChanged,
}: Props) {
  const [lead, setLead] = useState<LeadDetailRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingTemplate, setPendingTemplate] = useState<string | null>(null);
  const [templateScope, setTemplateScope] = useState<"all" | "this">("all");
  const [selectedTemplate, setSelectedTemplate] = useState<OutreachTemplateId | null>(null);
  const [writerMode, setWriterMode] = useState<WriterMode>("standard");
  const [writeOptionsOpen, setWriteOptionsOpen] = useState(false);
  const [rewriting, setRewriting] = useState(false);
  const [rewriteLabel, setRewriteLabel] = useState<string | undefined>();
  const [replyDraft, setReplyDraft] = useState<WriterDraft | null>(null);
  const [reviewSelection, setReviewSelection] = useState<{
    leadId: string;
    nodeId: ReviewNodeId;
  } | null>(null);
  const [ensuringDraft, setEnsuringDraft] = useState(false);
  const [ensuringCatalog, setEnsuringCatalog] = useState(false);
  const [draftingReply, setDraftingReply] = useState(false);
  /** Reply body stays closed until the user clicks Add reply (and only after they replied). */
  const [replyComposeOpen, setReplyComposeOpen] = useState(false);
  const [composeActions, setComposeActions] = useState<ComposeActionState | null>(null);
  const [recipients, setRecipients] = useState<string[]>([]);
  const approvalRef = useRef<OutreachApprovalHandle>(null);
  const catalogEnsureAttemptedRef = useRef<string | null>(null);

  const mode = resolveMode(tab, lead, isFollowUpReview);

  const load = useCallback(
    async (opts?: {
      silent?: boolean;
      replaceOutreach?: boolean;
      clearOutreach?: boolean;
    }) => {
      if (!opts?.silent) setLoading(true);
      try {
        invalidateCached(`/api/leads/${leadId}`);
        const next = await fetchLead(leadId, { force: true });
        setLead((prev) => {
          if (!prev || opts?.replaceOutreach || opts?.clearOutreach) return next;
          return mergeLeadOutreachFromServer(prev, next);
        });
        return next;
      } catch {
        if (!opts?.silent) {
          showError("Couldn't open this conversation", {
            description: "Try again, or refresh the Outbox queue.",
          });
          onClose();
        }
        return null;
      } finally {
        if (!opts?.silent) setLoading(false);
      }
    },
    [leadId, onClose],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    catalogEnsureAttemptedRef.current = null;
    setReplyComposeOpen(false);
    setReplyDraft(null);
    setComposeActions(null);
  }, [leadId]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    // Recipients for review follow-ups are synced after the active draft is resolved.
    if (!lead || mode === "review") return;
    const lastSent = lastOutboundRecipientEmail(
      lead.emailThread?.events ?? [],
      lead.emailThread?.barNodes,
    );
    setRecipients(defaultReplyRecipientEmails(lead.email, lead.emails, lastSent));
  }, [lead?.id, lead?.email, lead?.emails, lead?.emailThread?.events, lead?.emailThread?.barNodes, mode]);

  const phase = lead?.emailThread?.phase;
  const hasInbound =
    Boolean(lead?.emailThread?.inboundSnippet) ||
    lead?.status === "replied" ||
    (lead?.emailThread?.events ?? []).some((e) => e.kind === "inbound_reply");
  const hasOutboundReply = (lead?.emailThread?.events ?? []).some(
    (e) => e.kind === "outbound_reply",
  );
  const replyAlreadySent =
    phase === "reply_sent" || hasOutboundReply || Boolean(replyDraft?.replySent);

  const reviewTabs = useMemo(
    () => (lead && mode === "review" ? buildReviewDraftTabs(lead) : []),
    [lead, mode],
  );

  const defaultReviewNodeId = useMemo((): ReviewNodeId | null => {
    if (!lead || mode !== "review") return null;
    const pending = findReviewDraft(lead, draftOutreachId);
    if (pending) return reviewNodeIdForDraft(pending);
    return reviewTabs[0]?.id ?? null;
  }, [lead, mode, draftOutreachId, reviewTabs]);

  const selectedReviewNodeId: ReviewNodeId | null =
    reviewSelection?.leadId === leadId &&
    reviewTabs.some((t) => t.id === reviewSelection.nodeId)
      ? reviewSelection.nodeId
      : defaultReviewNodeId;

  const needsCatalogDraft = Boolean(
    lead &&
      mode === "review" &&
      selectedReviewNodeId === IF_OPENED_NODE_ID &&
      sequenceDraftAt(lead, 1) &&
      !catalogDraftFor(lead),
  );
  const catalogEnsureLeadId = needsCatalogDraft ? lead?.id ?? null : null;

  // Existing sequences may predate If Opened. Create the catalogue draft on demand.
  useEffect(() => {
    if (!catalogEnsureLeadId) return;
    if (catalogEnsureAttemptedRef.current === catalogEnsureLeadId) return;
    catalogEnsureAttemptedRef.current = catalogEnsureLeadId;
    const requestedLeadId = catalogEnsureLeadId;
    setEnsuringCatalog(true);
    void ensureCatalogOnOpenDraftClient({ leadId: requestedLeadId })
      .then(({ draft, drafts }) => {
        applyDraft(draft, drafts);
      })
      .catch((e) => {
        if (catalogEnsureAttemptedRef.current === requestedLeadId) {
          catalogEnsureAttemptedRef.current = null;
        }
        toast.error(e instanceof Error ? e.message : "Could not load If Opened draft");
      })
      .finally(() => {
        setEnsuringCatalog(false);
      });
  }, [catalogEnsureLeadId]);

  // Keep local reply draft in sync when lead outreach updates (only while composing).
  useEffect(() => {
    if (!lead || mode !== "reply" || !replyComposeOpen) return;
    const fromLead = findReplyDraft(lead);
    if (fromLead) setReplyDraft(fromLead);
  }, [lead, mode, replyComposeOpen]);

  async function openEmptyReplyComposer() {
    if (!lead || !hasInbound) return;
    setEnsuringDraft(true);
    try {
      const { draft, drafts } = await ensureBlankReplyDraftClient({ leadId: lead.id });
      // Always start from an empty body when the user clicks Add reply.
      const cleared = await updateOutreachDraft({
        leadOutreachId: draft.id,
        emailBody: "",
        emailBodyB: "",
        emailBodyC: "",
        chosenBodyKey: "A",
      });
      const emptyDraft: WriterDraft = {
        ...draft,
        ...cleared,
        emailBody: "",
        emailBodyB: "",
        emailBodyC: "",
        replySent: false,
        whatsapp: cleared.whatsapp ?? draft.whatsapp ?? undefined,
      };
      applyDraft(emptyDraft, drafts);
      setReplyComposeOpen(true);
      void load({ silent: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open reply draft");
    } finally {
      setEnsuringDraft(false);
    }
  }

  function applyDraft(draft: WriterDraft, sequence?: WriterDraft[]) {
    if (draft.templateVariant === "reply") {
      setReplyDraft(draft);
    }
    setLead((prev) => {
      if (!prev) return prev;
      // Keep outreached/replied status; applyWriterSequence would force draft_ready.
      if (sequence?.length) {
        return applyWriterDraft(
          { ...prev, outreachSequence: sequence },
          draft,
        );
      }
      return applyWriterDraft(prev, draft);
    });
  }

  async function handleSmartReply() {
    if (!lead) return;
    if (!hasInbound) {
      toast.message("Wait for their reply first", {
        description: "Add reply opens after they write back. Sync replies if you expected one.",
      });
      return;
    }
    if (!replyComposeOpen) {
      await openEmptyReplyComposer();
    }
    setDraftingReply(true);
    try {
      const draft = await runReplyWriter(lead.id);
      applyDraft(draft);
      setReplyComposeOpen(true);
      void load({ silent: true });
      toast.success("Reply draft ready");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Reply draft failed");
    } finally {
      setDraftingReply(false);
    }
  }

  async function handleSendNow() {
    if (!composeActions?.canSend) {
      if (!recipients.length) {
        toast.error(mode === "reply" ? REPLY_EMPTY_SEND_TO_HINT : EMPTY_SEND_TO_HINT);
      }
      return;
    }
    await approvalRef.current?.sendNow();
  }

  async function handleScheduleSend() {
    if (!composeActions?.canSend) {
      if (!recipients.length) {
        toast.error(mode === "reply" ? REPLY_EMPTY_SEND_TO_HINT : EMPTY_SEND_TO_HINT);
      }
      return;
    }
    await approvalRef.current?.scheduleSend();
  }

  const statusHint = useMemo(() => {
    if (!lead || mode !== "reply") return null;
    if (!hasInbound) return "Awaiting their reply. Conversation history is below.";
    if (replyComposeOpen) return null;
    if (replyAlreadySent) return "You already replied. Add another reply when you need to.";
    return "They replied. Add a reply when you are ready.";
  }, [lead, mode, hasInbound, replyAlreadySent, replyComposeOpen]);

  const sequenceState = lead?.emailThread?.sequenceState ?? "not_started";

  const resolvedReviewDraft =
    lead && mode === "review" && selectedReviewNodeId
      ? draftForReviewNode(lead, selectedReviewNodeId) ?? null
      : null;
  const activeDraft = mode === "review" ? resolvedReviewDraft : replyDraft;

  useEffect(() => {
    if (!lead || mode !== "review") return;
    const lastSent = lastOutboundRecipientEmail(
      lead.emailThread?.events ?? [],
      lead.emailThread?.barNodes,
    );
    const reuseThreadTo =
      Boolean(pendingFollowUpScheduleId) ||
      isSequenceFollowUpDraft(resolvedReviewDraft?.sequencePosition) ||
      isCatalogOnOpenDraft(resolvedReviewDraft);
    setRecipients(
      reuseThreadTo
        ? defaultReplyRecipientEmails(lead.email, lead.emails, lastSent)
        : defaultSelectedContactEmails(lead.email, lead.emails),
    );
  }, [
    lead?.id,
    lead?.email,
    lead?.emails,
    lead?.emailThread?.events,
    lead?.emailThread?.barNodes,
    mode,
    pendingFollowUpScheduleId,
    resolvedReviewDraft?.id,
    resolvedReviewDraft?.sequencePosition,
  ]);

  const showComposer = Boolean(
    activeDraft &&
      (mode === "review" ? true : replyComposeOpen && !replyDraft?.replySent),
  );
  const showAddReply = mode === "reply" && hasInbound && !replyComposeOpen && !ensuringDraft;
  const showSmartReply = mode === "reply" && hasInbound && replyComposeOpen && !replyAlreadySent;
  const email1Draft =
    lead ? sequenceDraftAt(lead, 1) : undefined;
  const viewingPendingFollowUp = Boolean(
    mode === "review" &&
      pendingFollowUpScheduleId &&
      resolvedReviewDraft &&
      (draftOutreachId
        ? resolvedReviewDraft.id === draftOutreachId
        : (resolvedReviewDraft.sequencePosition ?? 1) > 1 &&
          !isCatalogOnOpenDraft(resolvedReviewDraft)),
  );

  const modalTemplates = useMemo(() => {
    const all = lead?.outreachTemplates?.length ? lead.outreachTemplates : OUTREACH_TEMPLATES;
    const primary = all.filter((t) => t.id !== "follow_up" && t.id !== "final_reminder");
    return primary.length ? primary : all;
  }, [lead?.outreachTemplates]);

  const defaultModalTemplateId =
    lead?.defaultOutreachCta && modalTemplates.some((t) => t.id === lead.defaultOutreachCta)
      ? (lead.defaultOutreachCta as OutreachTemplateId)
      : modalTemplates[0]?.id ?? OUTREACH_TEMPLATES[0].id;

  const isEmailStageLead = lead?.status === "draft_ready" || lead?.status === "approved";

  useEffect(() => {
    if (!lead || mode !== "review") return;
    const seedDraft = sequenceDraftAt(lead, 1) ?? findReviewDraft(lead, draftOutreachId);
    if (seedDraft?.templateVariant && seedDraft.templateVariant !== "reply") {
      const fromDraft = seedDraft.templateVariant as OutreachTemplateId;
      if (modalTemplates.some((t) => t.id === fromDraft)) {
        setSelectedTemplate(fromDraft);
        return;
      }
    }
    const override = getBoardTemplateOverride();
    if (isEmailStageLead && override && modalTemplates.some((t) => t.id === override)) {
      setSelectedTemplate(override as OutreachTemplateId);
      return;
    }
    setSelectedTemplate(defaultModalTemplateId);
  }, [
    lead?.id,
    mode,
    lead?.defaultOutreachCta,
    modalTemplates,
    isEmailStageLead,
    draftOutreachId,
    defaultModalTemplateId,
    // Re-seed after a rewrite replaces Email 1
    lead?.outreach?.id,
    lead?.outreach?.templateVariant,
  ]);

  useEffect(() => {
    if (!selectedTemplate) return;
    if (!modalTemplates.some((t) => t.id === selectedTemplate)) {
      setSelectedTemplate(defaultModalTemplateId);
    }
  }, [modalTemplates, selectedTemplate, defaultModalTemplateId]);

  const activeModalTemplate =
    modalTemplates.find((t) => t.id === selectedTemplate) ?? modalTemplates[0] ?? OUTREACH_TEMPLATES[0];

  const showTemplateRewrite = mode === "review" && Boolean(lead) && reviewTabs.length > 0;

  function handleTemplateConfirm() {
    if (!pendingTemplate) return;
    setSelectedTemplate(pendingTemplate as OutreachTemplateId);
    if (templateScope === "all") setBoardTemplateOverride(pendingTemplate);
    setPendingTemplate(null);
  }

  function closeWriteOptions() {
    setWriteOptionsOpen(false);
    setPendingTemplate(null);
  }

  function selectWriteTemplate(templateId: string) {
    if (isEmailStageLead && templateId !== selectedTemplate) {
      setPendingTemplate(templateId);
      setTemplateScope("all");
      return;
    }
    setSelectedTemplate(templateId as OutreachTemplateId);
    setPendingTemplate(null);
  }

  /** Commits pending template scope and returns the template id to use for rewrite. */
  function commitPendingTemplate(): OutreachTemplateId {
    const fallback =
      (selectedTemplate ?? activeModalTemplate.id) as OutreachTemplateId;
    if (!pendingTemplate) return fallback;
    const next = pendingTemplate as OutreachTemplateId;
    setSelectedTemplate(next);
    if (templateScope === "all") setBoardTemplateOverride(pendingTemplate);
    setPendingTemplate(null);
    return next;
  }

  function writeOptionClass(selected: boolean) {
    return cn(
      "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] font-semibold text-brand-ink transition-colors",
      selected ? "bg-brand-stratus-blue/[0.07]" : "hover:bg-black/[0.03]",
    );
  }

  async function handleRewriteSequence(templateOverride?: OutreachTemplateId) {
    if (!lead || rewriting) return;
    const templateId =
      templateOverride ??
      ((selectedTemplate ?? activeModalTemplate.id) as OutreachTemplateId);
    setRewriting(true);
    setRewriteLabel(writerMode === "ai" ? "Rewriting Email 1 of 3" : "Draft 1 of 3");
    setComposeActions(null);
    try {
      const drafts = await runWriterSequence(lead.id, {
        outreachTemplate: templateId,
        writerMode,
      });
      setRewriteLabel("Draft 3 of 3");
      const first = drafts[0];
      if (first) applyDraft(first, drafts);
      setReviewSelection({ leadId: lead.id, nodeId: "draft-1" });
      await load({ silent: true, replaceOutreach: true });
      onChanged?.();
      toast.success("Sequence rewritten with selected template");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not rewrite sequence";
      toast.error(message);
      if (!/quota/i.test(message)) console.error(e);
    } finally {
      setRewriting(false);
      setRewriteLabel(undefined);
    }
  }

  const writeOptionsSummary = [writerMode === "ai" ? "AI" : "Std", activeModalTemplate.shortLabel]
    .filter(Boolean)
    .join(" · ");

  const highlightedTemplateId = pendingTemplate ?? selectedTemplate ?? activeModalTemplate.id;

  const hasInboundReply = Boolean(
    lead?.status === "replied" ||
      lead?.emailThread?.phase === "they_replied" ||
      lead?.emailThread?.phase === "drafting_reply" ||
      lead?.emailThread?.phase === "reply_sent" ||
      lead?.emailThread?.events?.some((e) => e.kind === "inbound_reply"),
  );
  const headerEyebrow =
    mode === "review" ? "Review draft" : hasInboundReply ? "Your Reply" : "Conversation";
  const selectedReviewTab =
    reviewTabs.find((t) => t.id === selectedReviewNodeId) ?? reviewTabs[0];
  const selectedReviewLabel = selectedReviewTab?.label ?? "Draft";
  const sequenceNotStartedForSend =
    mode === "review" && !isEmail1SentInThread(lead?.emailThread);
  const sendTargetIsEmail1 =
    sequenceNotStartedForSend && isNonInitialSequenceDraft(resolvedReviewDraft);
  const reviewComposeStatus = viewingPendingFollowUp
    ? "Follow-up"
    : sendTargetIsEmail1
      ? "Starts with Email 1"
      : isCatalogOnOpenDraft(resolvedReviewDraft)
        ? "If opened"
        : "Draft";
  const sendingBadgeLabel = sendTargetIsEmail1 ? "Sending Email 1" : "Sending this";
  const reviewCadence = lead?.emailThread?.cadenceDays ?? [3, 7];
  const reviewExcludeSequenceDays =
    !selectedReviewNodeId || selectedReviewNodeId === IF_OPENED_NODE_ID
      ? []
      : selectedReviewNodeId === "draft-1"
        ? [0]
        : selectedReviewNodeId === "draft-2"
          ? [reviewCadence[0] ?? 3]
          : selectedReviewNodeId === "draft-3"
            ? [reviewCadence[1] ?? 7]
            : [];
  const reviewExcludeLabels = selectedReviewLabel ? [selectedReviewLabel] : [];

  const linkedIn = lead
    ? personLinkedInHref({
        linkedIn: lead.linkedIn,
        name: lead.name,
        companyName: lead.company,
      })
    : null;

  const contactEmail =
    lead?.email?.trim() && lead.email !== "—"
      ? lead.email.trim()
      : lead?.emails?.find((entry) => entry.email?.trim())?.email?.trim();
  const contactPhone = lead?.phone?.trim() && lead.phone !== "—" ? lead.phone.trim() : null;
  const contactTitle = lead?.title?.trim() && lead.title !== "—" ? lead.title.trim() : null;
  const contactCity = lead?.city?.trim() && lead.city !== "—" ? lead.city.trim() : null;

  function handleReviewNodeSelect(nodeId: ReviewNodeId) {
    setReviewSelection({ leadId, nodeId });
  }

  const modal = (
    <div
      className="fixed inset-0 z-[9999] flex items-end justify-center bg-[rgba(20,24,36,0.42)] backdrop-blur-[3px] sm:items-center sm:p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="outreach-compose-title"
        className={cn(
          "flex max-h-[92vh] w-full flex-col overflow-hidden bg-white shadow-[0_24px_80px_rgba(20,24,36,0.28)]",
          "rounded-t-[20px] sm:max-w-3xl sm:rounded-[20px]",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-black/[0.06] px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-brand-ink-faint">
              {headerEyebrow}
            </p>
            <h2
              id="outreach-compose-title"
              className="truncate text-[16px] font-bold tracking-tight text-brand-ink"
            >
              {lead?.name ?? "Loading…"}
            </h2>
            {lead?.company ? (
              <p className="truncate text-[12px] text-brand-ink-soft">{lead.company}</p>
            ) : null}
            {lead ? (
              <div className="mt-2 flex items-center gap-1.5">
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger
                    className={cn(
                      "inline-flex h-7 items-center gap-1 rounded-full border border-brand-border/70 bg-white px-2 text-[11px] font-semibold text-brand-ink-soft transition-colors",
                      "hover:border-brand-ink/25 hover:text-brand-ink",
                    )}
                    aria-label="View contact details"
                    title="Contact details"
                  >
                    <UserRound className="size-3.5" />
                    <span>Contact</span>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-[min(100vw-2rem,16rem)] rounded-[14px] p-2">
                    <DropdownMenuLabel className="px-1.5 py-1 text-[10px] font-bold uppercase tracking-wide text-brand-ink-faint">
                      Contact details
                    </DropdownMenuLabel>
                    {contactTitle ? (
                      <div className="px-1.5 py-1.5 text-[12px] text-brand-ink">
                        <span className="block text-[10px] font-semibold uppercase tracking-wide text-brand-ink-faint">
                          Title
                        </span>
                        {contactTitle}
                      </div>
                    ) : null}
                    {contactEmail ? (
                      <a
                        href={`mailto:${contactEmail}`}
                        className="flex items-start gap-2 rounded-lg px-1.5 py-1.5 text-[12px] text-brand-ink transition-colors hover:bg-brand-app"
                      >
                        <Mail className="mt-0.5 size-3.5 shrink-0 text-brand-stratus-blue" />
                        <span className="min-w-0 break-all">{contactEmail}</span>
                      </a>
                    ) : null}
                    {contactPhone ? (
                      <a
                        href={`tel:${contactPhone.replace(/\s+/g, "")}`}
                        className="flex items-start gap-2 rounded-lg px-1.5 py-1.5 text-[12px] text-brand-ink transition-colors hover:bg-brand-app"
                      >
                        <Phone className="mt-0.5 size-3.5 shrink-0 text-brand-stratus-blue" />
                        <span className="min-w-0">{contactPhone}</span>
                      </a>
                    ) : null}
                    {contactCity ? (
                      <div className="flex items-start gap-2 px-1.5 py-1.5 text-[12px] text-brand-ink">
                        <MapPin className="mt-0.5 size-3.5 shrink-0 text-brand-ink-faint" />
                        <span className="min-w-0">{contactCity}</span>
                      </div>
                    ) : null}
                    {!contactTitle && !contactEmail && !contactPhone && !contactCity ? (
                      <p className="px-1.5 py-2 text-[12px] text-brand-ink-soft">No contact details yet</p>
                    ) : null}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => {
                        window.open(`/leads?lead=${lead.id}`, "_blank", "noopener,noreferrer");
                      }}
                      className="cursor-pointer text-[12px] font-semibold"
                    >
                      <ExternalLink className="size-3.5" />
                      Open lead
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                {linkedIn ? (
                  <a
                    href={linkedIn.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(
                      "inline-flex h-7 items-center gap-1 rounded-full border border-brand-border/70 bg-white px-2 text-[11px] font-semibold text-brand-ink-soft transition-colors",
                      "hover:border-brand-ink/25 hover:text-brand-ink",
                    )}
                    aria-label={
                      linkedIn.hasProfile
                        ? `Open ${lead.name} on LinkedIn`
                        : `Search LinkedIn for ${lead.name}`
                    }
                    title={linkedIn.hasProfile ? "LinkedIn profile" : "Find on LinkedIn"}
                  >
                    <LinkedInGlyph className="size-3.5 text-[#0A66C2]" />
                    <span>LinkedIn</span>
                  </a>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
            {showTemplateRewrite ? (
              <>
                <button
                  type="button"
                  disabled={rewriting}
                  onClick={() => setWriteOptionsOpen(true)}
                  className={cn(
                    "ish-scout-ghost inline-flex h-7 max-w-[9.5rem] shrink-0 items-center gap-1 rounded-full px-2 text-[11px] font-semibold text-brand-ink outline-none transition-all",
                    "hover:opacity-95 focus-visible:ring-2 focus-visible:ring-brand-stratus-blue/25 disabled:cursor-not-allowed disabled:opacity-40",
                  )}
                  title="Template and rewrite"
                >
                  <span className="truncate" title={writeOptionsSummary}>
                    {writeOptionsSummary}
                  </span>
                  <ChevronDown className="size-3 shrink-0 text-brand-ink-faint" />
                </button>
              </>
            ) : null}
            {lead && mode === "review" ? (
              <SequenceControlButtons
                leadId={lead.id}
                sequenceState={sequenceState}
                sending={composeActions?.sending}
                hideStart
                onUpdated={(meta) => {
                  if (meta?.action === "reset") {
                    onChanged?.();
                    onClose();
                    return;
                  }
                  void load({ silent: true });
                  onChanged?.();
                }}
                onStartSequence={async () => {
                  await handleSendNow();
                }}
              />
            ) : null}
            {lead && showComposer && !rewriting ? (
              <div className="inline-flex items-center gap-1">
                <button
                  type="button"
                  disabled={!composeActions?.canUndo}
                  onClick={() => approvalRef.current?.undo()}
                  title="Undo (⌘Z / Ctrl+Z)"
                  aria-label="Undo"
                  className="inline-flex size-7 items-center justify-center rounded-full text-brand-ink-soft transition-colors hover:bg-black/[0.04] hover:text-brand-ink disabled:cursor-default disabled:opacity-35"
                >
                  <Undo2 className="size-3.5" />
                </button>
                <button
                  type="button"
                  disabled={!composeActions?.canRedo}
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
                <ComposeSendButtons
                  composeActions={composeActions}
                  onSendNow={() => void handleSendNow()}
                  onScheduleSend={() => void handleScheduleSend()}
                />
              </div>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="flex size-8 shrink-0 items-center justify-center rounded-full border border-brand-border/70 bg-white text-brand-ink-soft transition-colors hover:text-brand-ink"
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3 sm:px-5 sm:py-4">
          {loading && !lead ? (
            <div className="flex min-h-[16rem] flex-col items-center justify-center gap-2 text-brand-ink-soft">
              <Loader2 className="size-5 animate-spin" />
              <p className="text-[13px]">
                {mode === "review" ? "Opening draft…" : "Opening conversation…"}
              </p>
            </div>
          ) : lead ? (
            <>
              {mode === "review" && reviewTabs.length > 0 ? (
                <div
                  role="tablist"
                  aria-label="Sequence drafts"
                  className="ish-email-segment inline-flex max-w-full flex-wrap rounded-[9px] bg-black/[0.05] p-0.5"
                >
                  {reviewTabs.map((tabItem) => {
                    const selected = (selectedReviewNodeId ?? reviewTabs[0]?.id) === tabItem.id;
                    return (
                      <button
                        key={tabItem.id}
                        type="button"
                        role="tab"
                        aria-selected={selected}
                        onClick={() => handleReviewNodeSelect(tabItem.id)}
                        className={cn(
                          "rounded-[7px] px-3 py-1 text-[12px] font-semibold tracking-wide transition-all",
                          selected
                            ? "bg-white text-brand-ink shadow-[0_1px_2px_rgba(0,0,0,0.08),0_0_0_0.5px_rgba(0,0,0,0.04)]"
                            : "text-brand-ink-soft hover:text-brand-ink",
                        )}
                      >
                        {tabItem.label}
                      </button>
                    );
                  })}
                </div>
              ) : null}
              {mode === "reply" && statusHint ? (
                <p className="rounded-[10px] border border-brand-stratus-blue/10 bg-brand-canvas/60 px-3 py-2 text-[12px] leading-snug text-brand-ink-soft">
                  {statusHint}
                </p>
              ) : null}

              {/* Reply mode: thread first (context), then compose. Review mode: compose first. */}
              {mode === "reply" ? (
                <ConversationTimeline
                  thread={lead.emailThread}
                  hideDraftEvents
                  showOutboundHistory
                />
              ) : null}

              {mode === "reply" && draftingReply ? (
                <div className="rounded-[16px] border border-brand-border bg-white py-10 shadow-[var(--shadow-brand-sm)]">
                  <WritingLoader
                    contactName={lead.name}
                    companyName={lead.company}
                    sequenceLabel="Drafting reply"
                  />
                </div>
              ) : mode === "review" && rewriting ? (
                <div className="rounded-[16px] border border-brand-border bg-white py-10 shadow-[var(--shadow-brand-sm)]">
                  <WritingLoader
                    contactName={lead.name}
                    companyName={lead.company}
                    sequenceLabel={rewriteLabel ?? "Rewriting sequence"}
                  />
                </div>
              ) : mode === "reply" && ensuringDraft ? (
                <div className="flex min-h-[8rem] flex-col items-center justify-center gap-2 text-brand-ink-soft">
                  <Loader2 className="size-5 animate-spin" />
                  <p className="text-[13px]">Opening empty reply…</p>
                </div>
              ) : mode === "review" && ensuringCatalog && selectedReviewNodeId === IF_OPENED_NODE_ID && !activeDraft ? (
                <div className="flex min-h-[10rem] flex-col items-center justify-center gap-2 text-brand-ink-soft">
                  <Loader2 className="size-5 animate-spin" />
                  <p className="text-[13px]">Opening If Opened draft…</p>
                </div>
              ) : showComposer && activeDraft ? (
                <div className="space-y-2">
                  {mode === "review" ? (
                    <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-brand-ink-faint">
                          Selected email
                        </p>
                        <p className="text-[13px] font-semibold text-brand-ink">
                          {selectedReviewLabel}
                          <span className="font-medium text-brand-ink-soft">
                            {" "}
                            · {reviewComposeStatus}
                          </span>
                        </p>
                      </div>
                      <span className="inline-flex items-center rounded-full bg-brand-stratus-blue/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-brand-stratus-blue ring-1 ring-brand-stratus-blue/20">
                        {sendingBadgeLabel}
                      </span>
                    </div>
                  ) : null}
                  <OutreachApprovalCard
                    ref={approvalRef}
                    key={`${lead.id}-${activeDraft.id}-${mode}`}
                    draft={activeDraft}
                    leadId={lead.id}
                    leadStatus={lead.status}
                    contactName={lead.name}
                    companyName={lead.company}
                    contactEmail={lead.email}
                    contactEmails={lead.emails}
                    selectedEmails={recipients}
                    onSelectedEmailsChange={setRecipients}
                    emailThread={lead.emailThread}
                    onDraftUpdated={(d) => applyDraft(d)}
                    onComposeActionsChange={setComposeActions}
                    contentScore={activeDraft.inboxScore ?? activeDraft.deliverabilityScore}
                    scheduleIdForFollowUp={
                      viewingPendingFollowUp ? pendingFollowUpScheduleId ?? undefined : undefined
                    }
                    startSequenceDraft={mode === "review" ? email1Draft : undefined}
                    onSent={() => {
                      setReplyComposeOpen(false);
                      setReplyDraft(null);
                      setComposeActions(null);
                      onChanged?.();
                      onClose();
                    }}
                    onSendFailed={() => void load({ silent: true })}
                  />
                </div>
              ) : mode === "reply" && showAddReply ? (
                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    disabled={ensuringDraft}
                    onClick={() => void openEmptyReplyComposer()}
                    className="ish-scout-cta-blue inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[12px] font-semibold transition-opacity hover:opacity-95 disabled:opacity-50"
                  >
                    <MessageSquarePlus className="size-3.5" />
                    Add reply
                  </button>
                </div>
              ) : mode === "review" ? (
                <p className="py-6 text-center text-[13px] text-brand-ink-soft">
                  No outreach draft available for this lead yet.
                </p>
              ) : null}

              {mode === "review" ? (
                <ConversationTimeline
                  thread={lead.emailThread}
                  hideDraftEvents
                  showOutboundHistory
                  variant="context"
                  heading="Earlier emails"
                  defaultCollapsed
                  excludeSequenceDays={reviewExcludeSequenceDays}
                  excludeLabels={reviewExcludeLabels}
                />
              ) : null}
            </>
          ) : null}
        </div>

        {lead && mode === "reply" ? (
          <footer className="flex shrink-0 flex-wrap items-center gap-1.5 border-t border-black/[0.06] bg-white px-3 py-2.5 sm:px-5">
            {showSmartReply ? (
              <button
                type="button"
                disabled={draftingReply || ensuringDraft}
                onClick={() => void handleSmartReply()}
                className="ish-scout-ghost inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12px] font-semibold transition-opacity hover:opacity-95 disabled:opacity-50"
              >
                <Sparkles className="size-3.5" />
                {draftingReply ? "Writing…" : "Write smart reply"}
              </button>
            ) : null}
            <SyncRepliesButton
              leadId={lead.id}
              leadName={lead.name}
              compact
              onSynced={() => void load({ silent: true })}
              className="ish-scout-ghost border-0 shadow-none"
            />
          </footer>
        ) : null}
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return (
    <>
      {createPortal(modal, document.body)}
      <AppModal open={writeOptionsOpen} onClose={closeWriteOptions} panelClassName="max-w-sm">
        <div className="pt-1">
          <h3 className="mb-4 pr-8 text-base font-semibold text-brand-ink">Write options</h3>
          <div className="space-y-4">
            <div>
              <p className="mb-1.5 px-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-ink-faint">
                Writer
              </p>
              <div className="space-y-0.5">
                <button
                  type="button"
                  className={writeOptionClass(writerMode === "standard")}
                  title="Personalizes templates with name and company"
                  onClick={() => setWriterMode("standard")}
                >
                  <span className="flex w-3 shrink-0 justify-center">
                    {writerMode === "standard" ? <Check className="size-3 text-brand-stratus-blue" /> : null}
                  </span>
                  Standard
                </button>
                <button
                  type="button"
                  className={writeOptionClass(writerMode === "ai")}
                  title="Writes with AI using research and brand context"
                  onClick={() => setWriterMode("ai")}
                >
                  <span className="flex w-3 shrink-0 justify-center">
                    {writerMode === "ai" ? <Check className="size-3 text-brand-stratus-blue" /> : null}
                  </span>
                  AI Writer
                </button>
              </div>
            </div>

            <div className="border-t border-black/[0.06] pt-4">
              <p className="mb-1.5 px-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-ink-faint">
                Template
              </p>
              <div className="space-y-0.5">
                {modalTemplates.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    className={writeOptionClass(highlightedTemplateId === template.id)}
                    title={template.description}
                    onClick={() => selectWriteTemplate(template.id)}
                  >
                    <span className="flex w-3 shrink-0 justify-center">
                      {highlightedTemplateId === template.id ? (
                        <Check className="size-3 text-brand-stratus-blue" />
                      ) : null}
                    </span>
                    {template.label}
                  </button>
                ))}
              </div>
            </div>

            {pendingTemplate ? (
              <div className="border-t border-black/[0.06] pt-4">
                <h4 className="mb-1 text-[13px] font-semibold text-brand-ink">Apply template change to…</h4>
                <p className="mb-3 text-[12px] text-brand-ink-soft">
                  {modalTemplates.find((t) => t.id === pendingTemplate)?.label ?? "New template"}
                </p>
                <div className="space-y-3">
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="radio"
                      name="compose-template-scope"
                      value="all"
                      checked={templateScope === "all"}
                      onChange={() => setTemplateScope("all")}
                      className="mt-0.5 accent-brand-stratus-blue"
                    />
                    <span className="text-[13px] text-brand-ink">
                      All leads in Email column
                      <span className="mt-0.5 block text-[11px] text-brand-ink-faint">
                        Every lead currently in the Email stage will use this template
                      </span>
                    </span>
                  </label>
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="radio"
                      name="compose-template-scope"
                      value="this"
                      checked={templateScope === "this"}
                      onChange={() => setTemplateScope("this")}
                      className="mt-0.5 accent-brand-stratus-blue"
                    />
                    <span className="text-[13px] text-brand-ink">This lead only</span>
                  </label>
                </div>
              </div>
            ) : null}
          </div>

          <div className="mt-5 flex flex-col gap-2 border-t border-black/[0.06] pt-4">
            {pendingTemplate ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full justify-center rounded-full"
                onClick={() => handleTemplateConfirm()}
              >
                Apply template
              </Button>
            ) : null}
            <button
              type="button"
              disabled={rewriting}
              onClick={() => {
                const templateId = commitPendingTemplate();
                closeWriteOptions();
                void handleRewriteSequence(templateId);
              }}
              className={cn(
                "inline-flex w-full items-center justify-center gap-1.5 rounded-full px-3 py-2.5 text-[12px] font-semibold",
                !rewriting ? "ish-scout-cta-blue" : "ish-scout-cta-muted",
              )}
            >
              <FileText className="size-3.5" />
              {rewriting ? "Rewriting…" : "Rewrite sequence"}
            </button>
          </div>
        </div>
      </AppModal>
    </>
  );
}

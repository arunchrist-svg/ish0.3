"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import type { ContactEmailEntry, EmailThread, WriterDraft } from "@/lib/api-client";
import {
  approveOutreach,
  sendOutreach,
  sendFollowUp,
  updateOutreachDraft,
  EmailSendRejectedError,
} from "@/lib/api-client";
import { sendWithGateConfirm } from "@/lib/outreach/send-with-gate-confirm";
import { handleWhatsAppAutoOpenResponse } from "@/lib/whatsapp/open-click";
import {
  defaultReplyRecipientEmails,
  defaultSelectedContactEmails,
  EMPTY_SEND_TO_HINT,
  lastOutboundRecipientEmail,
  REPLY_EMPTY_SEND_TO_HINT,
  retainSelectedRecipientEmails,
  SELECT_NEW_SEND_TO_HINT,
  selectedEmailsForSend,
  type SendRecipientMode,
} from "@/lib/outreach/send-recipients";
import { text } from "@/design-system/tokens";
import { toast } from "sonner";
import { EmailEditChat } from "./email-edit-chat";
import {
  asVariantKey,
  draftBodyOptions,
  draftSubjectOptions,
  followUpThreadSubject,
  isSequenceFollowUpDraft,
  resolveDraftBody,
  resolveDraftSubject,
  type VariantKey,
} from "@/lib/email/draft-variants";
import { appendEmailSignature } from "@/lib/email/templates";
import {
  applyComposeSnapshot,
  snapshotFromDraft,
} from "@/lib/email/compose-history";
import { useComposeHistory } from "@/hooks/use-compose-history";

export type ComposeActionState = {
  dirty: boolean;
  saving: boolean;
  sending: boolean;
  canSave: boolean;
  canSend: boolean;
  canUndo: boolean;
  canRedo: boolean;
  showSave: boolean;
  sendLabel: string;
  viewInEmailOnly: boolean;
};

export type OutreachApprovalHandle = {
  save: () => void;
  send: () => Promise<void>;
  undo: () => void;
  redo: () => void;
};

type Props = {
  draft: WriterDraft;
  leadId: string;
  leadStatus: string;
  contactName?: string;
  companyName?: string;
  contactEmail?: string;
  contactEmails?: ContactEmailEntry[];
  onDraftUpdated: (draft: WriterDraft) => void;
  onComposeActionsChange?: (state: ComposeActionState | null) => void;
  onSent?: () => void;
  onSendFailed?: () => void;
  /** Position-1 draft used when starting the sequence from Draft 2/3. */
  startSequenceDraft?: WriterDraft;
  selectedEmails?: string[];
  onSelectedEmailsChange?: (emails: string[]) => void;
  chosenSubjectKey?: VariantKey;
  onChosenSubjectKeyChange?: (key: VariantKey) => void;
  contentScore?: number;
  emailThread?: EmailThread;
  scheduleIdForFollowUp?: string;
};

export { defaultSelectedContactEmails };

function VariantSegment({
  value,
  options,
  disabled,
  onChange,
}: {
  value: VariantKey;
  options: VariantKey[];
  disabled?: boolean;
  onChange: (key: VariantKey) => void;
}) {
  if (options.length < 2) return null;
  return (
    <div
      role="radiogroup"
      aria-label="Draft version"
      className="ish-email-segment inline-flex rounded-[9px] bg-black/[0.05] p-0.5"
    >
      {options.map((key) => {
        const checked = key === value;
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={checked}
            disabled={disabled}
            onClick={() => onChange(key)}
            className={cn(
              "min-w-[2.25rem] rounded-[7px] px-3 py-1 text-[12px] font-semibold tracking-wide transition-all",
              checked
                ? "bg-white text-brand-ink shadow-[0_1px_2px_rgba(0,0,0,0.08),0_0_0_0.5px_rgba(0,0,0,0.04)]"
                : "text-brand-ink-soft hover:text-brand-ink",
              disabled && "cursor-default opacity-50",
            )}
          >
            {key}
          </button>
        );
      })}
    </div>
  );
}

function draftPatchPayload(
  draft: WriterDraft,
  subjectKey: VariantKey,
  bodyKey: VariantKey,
  payload?: Partial<
    Pick<
      WriterDraft,
      | "emailBody"
      | "emailBodyB"
      | "emailBodyC"
      | "subjectA"
      | "subjectB"
      | "subjectC"
      | "chosenSubjectKey"
      | "chosenBodyKey"
    >
  >,
) {
  return {
    leadOutreachId: draft.id,
    subjectA: payload?.subjectA ?? draft.subjectA,
    subjectB: payload?.subjectB ?? draft.subjectB,
    subjectC: payload?.subjectC ?? draft.subjectC,
    emailBody: payload?.emailBody ?? draft.emailBody,
    emailBodyB: payload?.emailBodyB ?? draft.emailBodyB,
    emailBodyC: payload?.emailBodyC ?? draft.emailBodyC,
    chosenSubjectKey: payload?.chosenSubjectKey ?? subjectKey,
    chosenBodyKey: payload?.chosenBodyKey ?? bodyKey,
  };
}

export const OutreachApprovalCard = forwardRef<OutreachApprovalHandle, Props>(function OutreachApprovalCard({
  draft,
  leadId,
  leadStatus,
  contactName: _contactName,
  companyName: _companyName,
  contactEmail,
  contactEmails,
  onDraftUpdated,
  onComposeActionsChange,
  onSent,
  onSendFailed,
  startSequenceDraft,
  selectedEmails: selectedEmailsProp,
  onSelectedEmailsChange,
  chosenSubjectKey: chosenSubjectKeyProp,
  onChosenSubjectKeyChange,
  contentScore,
  emailThread,
  scheduleIdForFollowUp,
}, ref) {
  const [subjectKeyLocal, setSubjectKeyLocal] = useState<VariantKey>(() => asVariantKey(draft.chosenSubjectKey));
  const subjectKey = chosenSubjectKeyProp ?? subjectKeyLocal;
  function setSubjectKey(key: VariantKey) {
    if (onChosenSubjectKeyChange) onChosenSubjectKeyChange(key);
    else setSubjectKeyLocal(key);
  }
  const [bodyKey, setBodyKey] = useState<VariantKey>(() => asVariantKey(draft.chosenBodyKey));
  const [displayDraft, setDisplayDraft] = useState(draft);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [sending, setSending] = useState(false);
  const [outreachPaused, setOutreachPaused] = useState(false);
  const [emailSignature, setEmailSignature] = useState("");

  const dirtyRef = useRef(false);
  const displayDraftRef = useRef(displayDraft);
  const subjectKeyRef = useRef(subjectKey);
  const bodyKeyRef = useRef(bodyKey);
  const onDraftUpdatedRef = useRef(onDraftUpdated);
  const lockedRef = useRef(false);

  const {
    canUndo,
    canRedo,
    recordChange,
    commitNow,
    undo,
    redo,
    reset: resetHistory,
  } = useComposeHistory(draft.id, snapshotFromDraft(draft));

  const applyHistorySnapshot = useCallback((snap: ReturnType<typeof snapshotFromDraft>) => {
    setDisplayDraft((prev) => applyComposeSnapshot(prev, snap));
    setDirty(true);
  }, []);

  const handleUndo = useCallback(() => {
    const snap = undo();
    if (snap) applyHistorySnapshot(snap);
  }, [undo, applyHistorySnapshot]);

  const handleRedo = useCallback(() => {
    const snap = redo();
    if (snap) applyHistorySnapshot(snap);
  }, [redo, applyHistorySnapshot]);

  const sentEmailKeys = (() => {
    const keys = new Set<string>();
    for (const ev of emailThread?.events ?? []) {
      if (ev.recipientEmail && (ev.status === "sent" || ev.status === "opened" || ev.status === "bounced")) {
        keys.add(ev.recipientEmail.trim().toLowerCase());
      }
    }
    for (const node of emailThread?.barNodes ?? []) {
      if (node.recipientEmail && (node.kind === "sent" || node.bouncedAt)) {
        keys.add(node.recipientEmail.trim().toLowerCase());
      }
    }
    for (const entry of contactEmails ?? []) {
      if (entry.testStatus === "sent") keys.add(entry.email.trim().toLowerCase());
    }
    return keys;
  })();

  const guessLabel = (pattern?: string) =>
    pattern === "first.last"
      ? "first.last@company"
      : pattern === "first"
        ? "firstname@company"
        : pattern === "last"
          ? "lastname@company"
          : pattern;

  const isReplyDraft = draft.templateVariant === "reply" || draft.promptVersion?.includes("reply");
  const lastSentRecipient = lastOutboundRecipientEmail(
    emailThread?.events ?? [],
    emailThread?.barNodes,
  );

  const selectableEmails = (() => {
    const seen = new Set<string>();
    const out: { email: string; label?: string; isPrimary: boolean; sent: boolean }[] = [];
    const add = (email: string, label?: string, isPrimary = false) => {
      const key = email.trim().toLowerCase();
      if (!key || !key.includes("@") || key === "—" || seen.has(key)) return;
      seen.add(key);
      out.push({ email: email.trim(), label, isPrimary, sent: sentEmailKeys.has(key) });
    };
    if (contactEmail?.trim()) add(contactEmail.trim(), "Fetched", true);
    for (const entry of contactEmails ?? []) {
      const isPrimary =
        Boolean(contactEmail?.trim()) &&
        entry.email.trim().toLowerCase() === contactEmail!.trim().toLowerCase();
      const label =
        guessLabel(entry.pattern) ??
        (entry.enrichmentProvider === "permutation"
          ? "Guessed"
          : isPrimary
            ? "Fetched"
            : undefined);
      add(entry.email, label, isPrimary);
    }
    if (lastSentRecipient) add(lastSentRecipient, "Thread");
    return out;
  })();

  const isFollowUpReview = Boolean(scheduleIdForFollowUp);
  const isSequenceFollowUp = isSequenceFollowUpDraft(draft.sequencePosition);
  /** Reply + Email 2/3 / pending follow-up: same To as last outbound, not "send to a new inbox". */
  const reusesPriorTo = isReplyDraft || isSequenceFollowUp || isFollowUpReview;
  const recipientSendMode: SendRecipientMode = isReplyDraft
    ? "reply"
    : isSequenceFollowUp || isFollowUpReview
      ? "follow_up"
      : "outbound";

  const [selectedEmailsLocal, setSelectedEmailsLocal] = useState<string[]>(() =>
    reusesPriorTo
      ? defaultReplyRecipientEmails(contactEmail, contactEmails, lastSentRecipient)
      : defaultSelectedContactEmails(contactEmail, contactEmails),
  );
  const selectedEmails = selectedEmailsProp ?? selectedEmailsLocal;
  function setSelectedEmails(next: string[] | ((prev: string[]) => string[])) {
    const resolved = typeof next === "function" ? next(selectedEmails) : next;
    if (onSelectedEmailsChange) onSelectedEmailsChange(resolved);
    else setSelectedEmailsLocal(resolved);
  }
  // Reply drafts stay editable until sent, even when the lead is already outreached.
  // Email 2/3 and pending follow-up review stay editable so board / Needs Review can edit before send.
  const isDraftLocked = isReplyDraft
    ? Boolean(draft.replySent)
    : isSequenceFollowUp || isFollowUpReview
      ? false
      : ["outreached", "meeting", "po_closed", "tasting_sent", "negotiate", "closed"].includes(leadStatus);
  const canSendToAdditional =
    isDraftLocked &&
    !reusesPriorTo &&
    (leadStatus === "outreached" || sentEmailKeys.size > 0);

  useEffect(() => {
    const defaults = reusesPriorTo
      ? defaultReplyRecipientEmails(contactEmail, contactEmails, lastSentRecipient)
      : defaultSelectedContactEmails(contactEmail, contactEmails);
    setSelectedEmails((prev) =>
      retainSelectedRecipientEmails(
        prev,
        selectableEmails.map((s) => s.email),
        sentEmailKeys,
        defaults,
        { allowAlreadySent: reusesPriorTo },
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactEmail, contactEmails, leadStatus, reusesPriorTo, lastSentRecipient]);

  const subjectOptions = draftSubjectOptions(displayDraft);
  const bodyOptions = draftBodyOptions(displayDraft);
  /** Keep A|B sticky while editing. Do not re-derive from trimmed/filtered options. */
  const activeVariant: VariantKey = asVariantKey(
    subjectKey === bodyKey ? subjectKey : bodyKey,
  );
  // Raw field values only. Never trim or fall back to the other variant in the editor,
  // or the caret jumps to the end on every keystroke.
  const bodyText =
    activeVariant === "B"
      ? (displayDraft.emailBodyB ?? "")
      : (displayDraft.emailBody ?? "");
  const activeSubject =
    activeVariant === "B"
      ? (displayDraft.subjectB ?? "")
      : (displayDraft.subjectA ?? "");
  const hasVariantB =
    activeVariant === "B" ||
    Boolean(displayDraft.emailBodyB?.trim()) ||
    Boolean(displayDraft.subjectB?.trim()) ||
    bodyOptions.some((o) => o.key === "B") ||
    subjectOptions.some((o) => o.key === "B");
  const variantOptions: VariantKey[] = hasVariantB ? ["A", "B"] : ["A"];

  function selectVariant(key: VariantKey) {
    if (isDraftLocked) return;
    setSubjectKey(key);
    setBodyKey(key);
    setDirty(true);
  }

  dirtyRef.current = dirty;
  displayDraftRef.current = displayDraft;
  subjectKeyRef.current = subjectKey;
  bodyKeyRef.current = bodyKey;
  onDraftUpdatedRef.current = onDraftUpdated;
  lockedRef.current = isDraftLocked;

  useEffect(() => {
    setDisplayDraft(draft);
    resetHistory(snapshotFromDraft(draft));
    const key = asVariantKey(draft.chosenSubjectKey ?? draft.chosenBodyKey);
    if (!onChosenSubjectKeyChange) setSubjectKeyLocal(key);
    setBodyKey(key);
    setDirty(false);
    // Only reset the editor when switching to a different draft. Same-id parent
    // refreshes must not wipe in-progress edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.id]);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/settings/email/sending")
      .then((r) => (r.ok ? r.json() : null))
      .then((cfg) => {
        if (cancelled || !cfg) return;
        setOutreachPaused(Boolean(cfg.outreachPaused));
        setEmailSignature(typeof cfg.signature === "string" ? cfg.signature : "");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const bodyWithSignature = appendEmailSignature(bodyText, emailSignature);
  const signaturePreview = emailSignature.trim();
  const bodyAlreadyHasSignature =
    Boolean(signaturePreview) &&
    bodyText.replace(/\s+/g, " ").toLowerCase().includes(signaturePreview.replace(/\s+/g, " ").toLowerCase());

  const persistDraft = useCallback(
    async (
      payload?: Partial<
        Pick<
          WriterDraft,
          | "emailBody"
          | "emailBodyB"
          | "emailBodyC"
          | "subjectA"
          | "subjectB"
          | "subjectC"
          | "chosenSubjectKey"
          | "chosenBodyKey"
        >
      >,
    ) => {
      setSaving(true);
      const snapshot = displayDraftRef.current;
      const variant = asVariantKey(
        subjectKeyRef.current === bodyKeyRef.current
          ? subjectKeyRef.current
          : bodyKeyRef.current,
      );
      try {
        const updated = await updateOutreachDraft({
          ...draftPatchPayload(snapshot, variant, variant, payload),
          leadOutreachId: draft.id,
        });
        // Prefer any edits typed while the request was in flight.
        const latest = displayDraftRef.current;
        const next = {
          ...latest,
          subjectA: latest.subjectA !== snapshot.subjectA ? latest.subjectA : (updated.subjectA ?? latest.subjectA),
          subjectB: latest.subjectB !== snapshot.subjectB ? latest.subjectB : (updated.subjectB ?? latest.subjectB),
          subjectC: latest.subjectC !== snapshot.subjectC ? latest.subjectC : (updated.subjectC ?? latest.subjectC),
          emailBody: latest.emailBody !== snapshot.emailBody ? latest.emailBody : (updated.emailBody ?? latest.emailBody),
          emailBodyB:
            latest.emailBodyB !== snapshot.emailBodyB
              ? latest.emailBodyB
              : (updated.emailBodyB ?? latest.emailBodyB),
          emailBodyC:
            latest.emailBodyC !== snapshot.emailBodyC
              ? latest.emailBodyC
              : (updated.emailBodyC ?? latest.emailBodyC),
          chosenSubjectKey: updated.chosenSubjectKey ?? variant,
          chosenBodyKey: updated.chosenBodyKey ?? variant,
        };
        setDisplayDraft(next);
        onDraftUpdated(next);
        const stillDirty =
          latest.emailBody !== snapshot.emailBody ||
          latest.emailBodyB !== snapshot.emailBodyB ||
          latest.subjectA !== snapshot.subjectA ||
          latest.subjectB !== snapshot.subjectB;
        setDirty(stillDirty);
        return true;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not save draft");
        return false;
      } finally {
        setSaving(false);
      }
    },
    [draft.id, onDraftUpdated],
  );

  useEffect(() => {
    if (!dirty || isDraftLocked || saving) return;
    const timer = window.setTimeout(() => {
      void persistDraft();
    }, 600);
    return () => window.clearTimeout(timer);
  }, [dirty, displayDraft, persistDraft, isDraftLocked, saving]);

  useEffect(() => {
    return () => {
      if (!dirtyRef.current || lockedRef.current) return;
      const current = displayDraftRef.current;
      void updateOutreachDraft(draftPatchPayload(current, subjectKeyRef.current, bodyKeyRef.current))
        .then((updated) => {
          onDraftUpdatedRef.current({
            ...current,
            subjectA: updated.subjectA ?? current.subjectA,
            subjectB: updated.subjectB ?? current.subjectB,
            subjectC: updated.subjectC ?? current.subjectC,
            emailBody: updated.emailBody ?? current.emailBody,
            emailBodyB: updated.emailBodyB ?? current.emailBodyB,
            emailBodyC: updated.emailBodyC ?? current.emailBodyC,
            chosenSubjectKey: updated.chosenSubjectKey ?? subjectKeyRef.current,
            chosenBodyKey: updated.chosenBodyKey ?? bodyKeyRef.current,
          });
        })
        .catch(() => {});
    };
  }, []);

  function handleDraftUpdated(updated: WriterDraft) {
    commitNow(snapshotFromDraft(displayDraftRef.current));
    setDisplayDraft(updated);
    commitNow(snapshotFromDraft(updated));
    onDraftUpdated(updated);
    setDirty(false);
  }

  const threadSubject = followUpThreadSubject({
    // In compose, prefer live Email 1 over a cached thread root so Re: tracks subject edits.
    threadRootSubject:
      startSequenceDraft &&
      (emailThread?.barMode === "drafts" || emailThread?.phase === "compose")
        ? undefined
        : emailThread?.threadRootSubject,
    email1Draft: startSequenceDraft,
    chosenSubjectKey: chosenSubjectKeyProp ?? startSequenceDraft?.chosenSubjectKey,
  });
  // Reply drafts keep a read-only Re: thread subject. Email 2/3 and If Opened use an
  // editable Subject field (defaults may still be Re: Email 1 via generation/sync).
  const showReRow = Boolean(isReplyDraft && threadSubject);

  function handleSubjectChange(value: string) {
    const field = activeVariant === "B" ? "subjectB" : "subjectA";
    setDisplayDraft((prev) => {
      const next = { ...prev, [field]: value };
      recordChange(snapshotFromDraft(next));
      return next;
    });
    setDirty(true);
  }

  function handleBodyChange(value: string) {
    const field = activeVariant === "B" ? "emailBodyB" : "emailBody";
    setDisplayDraft((prev) => {
      const next = { ...prev, [field]: value };
      recordChange(snapshotFromDraft(next));
      return next;
    });
    setDirty(true);
  }

  function handleComposeKeyDown(e: KeyboardEvent) {
    if (isDraftLocked) return;
    const mod = e.metaKey || e.ctrlKey;
    if (!mod) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest("[data-email-edit-chat]")) return;

    const key = e.key.toLowerCase();
    if (key === "z" && !e.shiftKey) {
      e.preventDefault();
      handleUndo();
      return;
    }
    if ((key === "z" && e.shiftKey) || key === "y") {
      e.preventDefault();
      handleRedo();
    }
  }

  async function handleSave() {
    const ok = await persistDraft();
    if (ok) toast.success("Draft saved");
  }

  async function handleSendToOutreach() {
    if (outreachPaused) {
      toast.error("Outreach sending is paused. Resume in Email queue or Settings.");
      return;
    }
    if (!selectedEmails.length) {
      toast.error(isReplyDraft ? REPLY_EMPTY_SEND_TO_HINT : EMPTY_SEND_TO_HINT);
      return;
    }

    // Before any outbound: starting the sequence from Draft 2/3 still sends Email 1 first.
    // After Email 1 is out: Email 2/3 send the follow-up draft itself (same To as last outbound).
    const sequenceNotStarted =
      sentEmailKeys.size === 0 &&
      !["outreached", "meeting", "po_closed", "tasting_sent", "negotiate", "closed"].includes(
        leadStatus,
      );
    const sendDraft =
      !isReplyDraft &&
      !isFollowUpReview &&
      sequenceNotStarted &&
      startSequenceDraft &&
      isSequenceFollowUp
        ? startSequenceDraft
        : displayDraft;

    const sendSubjectKey = activeVariant;
    const sendBodyKey =
      sendDraft.id === displayDraft.id
        ? activeVariant
        : asVariantKey(sendDraft.chosenBodyKey);
    const subjectToSend =
      isReplyDraft && threadSubject
        ? threadSubject
        : sendDraft.id === displayDraft.id
          ? activeSubject
          : resolveDraftSubject(sendDraft, sendSubjectKey);
    const bodyToSend =
      sendDraft.id === displayDraft.id
        ? bodyText
        : resolveDraftBody(sendDraft, sendBodyKey);

    if (!subjectToSend?.trim() || !bodyToSend.trim()) {
      toast.error("Subject and body are required");
      return;
    }

    setSending(true);
    try {
      if (!isDraftLocked) {
        const saved = await persistDraft({
          chosenSubjectKey: activeVariant,
          chosenBodyKey: activeVariant,
        });
        if (!saved) return;
        if (sendDraft.id !== displayDraft.id) {
          await updateOutreachDraft({
            leadOutreachId: sendDraft.id,
            chosenSubjectKey: activeVariant,
          });
        }
      }

      if (isFollowUpReview && scheduleIdForFollowUp) {
        const result = await sendWithGateConfirm((overrides) =>
          sendFollowUp(scheduleIdForFollowUp, overrides),
        );
        toast.success(`Follow-up sent (${result.mode})`);
        handleWhatsAppAutoOpenResponse(result.whatsappOpen);
        onSent?.();
        return;
      }

      const { approvalId } = await approveOutreach({
        leadOutreachId: sendDraft.id,
        leadId,
        channel: "email",
        status: "approved",
        subjectUsed: subjectToSend,
        bodyUsed: bodyToSend,
      });

      const recipientsToSend = selectedEmailsForSend(
        selectedEmails,
        sentEmailKeys,
        recipientSendMode,
      );
      if (!recipientsToSend.length) {
        toast.error(
          recipientSendMode === "reply"
            ? REPLY_EMPTY_SEND_TO_HINT
            : recipientSendMode === "follow_up"
              ? EMPTY_SEND_TO_HINT
              : SELECT_NEW_SEND_TO_HINT,
        );
        return;
      }

      const result = await sendWithGateConfirm((overrides) =>
        sendOutreach(approvalId, {
          ...overrides,
          toEmails: recipientsToSend,
        }),
      );
      const recipient =
        result.recipients?.length
          ? result.recipients.join(", ")
          : result.to ?? selectedEmails.join(", ");
      const modeLabel =
        result.mode === "dry_run" ? "logged (dry run, not sent)" : `sent to ${recipient}`;
      toast.success(`Email ${modeLabel}`, {
        action: {
          label: "Open queue",
          onClick: () => window.location.assign("/email?tab=active"),
        },
      });
      onSent?.();
    } catch (e) {
      if (e instanceof EmailSendRejectedError) {
        onSendFailed?.();
        if (e.canRetry && e.nextEmail) {
          toast.error(`Send failed for ${e.rejectedEmail}`, {
            description: `Next candidate ready: ${e.nextEmail}. Retry send when ready.`,
            duration: 8000,
          });
        } else {
          toast.error(e.message || "Could not send email");
        }
      } else {
        toast.error(e instanceof Error ? e.message : "Could not send email");
      }
    } finally {
      setSending(false);
    }
  }

  const sendLabel = isFollowUpReview
    ? "Send follow-up"
    : isReplyDraft
      ? "Send Reply"
      : canSendToAdditional
        ? "Send to new"
        : "Send";

  useImperativeHandle(
    ref,
    () => ({
      save: () => {
        void handleSave();
      },
      send: () => handleSendToOutreach(),
      undo: () => handleUndo(),
      redo: () => handleRedo(),
    }),
    // Handlers close over latest state each render
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dirty, saving, sending, selectedEmails, displayDraft, activeVariant, outreachPaused, canUndo, canRedo],
  );

  useEffect(() => {
    onComposeActionsChange?.({
      dirty,
      saving,
      sending,
      canSave: dirty && !saving && !sending && !canSendToAdditional,
      canSend: !sending && !saving && !outreachPaused && selectedEmails.length > 0,
      canUndo,
      canRedo,
      showSave: !canSendToAdditional && !(isDraftLocked && !canSendToAdditional),
      sendLabel,
      viewInEmailOnly: isDraftLocked && !canSendToAdditional,
    });
    return () => onComposeActionsChange?.(null);
  }, [
    dirty,
    saving,
    sending,
    canSendToAdditional,
    canUndo,
    canRedo,
    isDraftLocked,
    outreachPaused,
    selectedEmails.length,
    sendLabel,
    onComposeActionsChange,
  ]);

  return (
    <div
      id="approval-card"
      className="ish-email-compose min-w-0 overflow-hidden bg-white lg:rounded-[16px] lg:border lg:border-black/[0.08] lg:shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.06)]"
      onKeyDown={handleComposeKeyDown}
    >
      <div className="flex min-w-0 flex-col">
        {reusesPriorTo && !isDraftLocked ? (
          <div className="flex items-center gap-3 border-b border-black/[0.06] px-4 py-2">
            <span className="w-14 shrink-0 text-[12px] font-medium text-brand-ink-faint">To</span>
            <p className="min-w-0 flex-1 truncate text-[14px] text-brand-ink">
              {selectedEmails.length ? selectedEmails.join(", ") : "No email address"}
            </p>
          </div>
        ) : null}

        {showReRow ? (
          <div className="flex items-center gap-3 border-b border-black/[0.06] px-4 py-2">
            <span className="w-14 shrink-0 text-[12px] font-medium text-brand-ink-faint">Re</span>
            <p className="min-w-0 flex-1 truncate text-[14px] font-medium text-brand-ink">
              {threadSubject}
            </p>
            {variantOptions.length > 1 ? (
              <VariantSegment
                value={activeVariant}
                options={variantOptions}
                disabled={isDraftLocked}
                onChange={selectVariant}
              />
            ) : null}
          </div>
        ) : (
          <div className="flex items-center gap-3 border-b border-black/[0.06] px-4 py-2">
            <span className="w-14 shrink-0 text-[12px] font-medium text-brand-ink-faint">Subject</span>
            {isDraftLocked ? (
              <p className="min-w-0 flex-1 truncate text-[14px] font-medium text-brand-ink">
                {activeSubject || "No subject"}
              </p>
            ) : (
              <input
                type="text"
                value={activeSubject}
                onChange={(e) => handleSubjectChange(e.target.value)}
                onBlur={() => commitNow()}
                placeholder="Subject"
                className="min-w-0 flex-1 truncate border-0 bg-transparent px-0 py-0 text-[14px] font-medium text-brand-ink placeholder:text-brand-ink-faint focus:outline-none focus:ring-0"
              />
            )}
            {variantOptions.length > 1 ? (
              <VariantSegment
                value={activeVariant}
                options={variantOptions}
                disabled={isDraftLocked}
                onChange={selectVariant}
              />
            ) : null}
          </div>
        )}

        <div className="ish-email-body px-4 py-3">
          {isDraftLocked ? (
            <p
              className={cn(
                text.body,
                "min-h-[12rem] whitespace-pre-wrap text-[14px] leading-[1.55] text-brand-ink-soft",
              )}
            >
              {bodyWithSignature || "No message"}
            </p>
          ) : (
            <>
              <textarea
                value={bodyText}
                onChange={(e) => handleBodyChange(e.target.value)}
                onBlur={() => commitNow()}
                placeholder="Write your message…"
                className={cn(
                  "block min-h-[16rem] w-full resize-none border-0 bg-transparent px-0 py-0",
                  text.body,
                  "whitespace-pre-wrap text-[14px] leading-[1.55] text-brand-ink placeholder:text-brand-ink-faint focus:outline-none focus:ring-0",
                )}
              />
              {signaturePreview && !bodyAlreadyHasSignature ? (
                <div className="mt-4 border-t border-black/[0.06] pt-3">
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-brand-ink-faint">
                    Signature (from Settings)
                  </p>
                  <p className="whitespace-pre-wrap text-[14px] leading-[1.55] text-brand-ink-soft">
                    {signaturePreview}
                  </p>
                </div>
              ) : null}
            </>
          )}
        </div>

        {!isDraftLocked ? (
          <div className="border-t border-black/[0.06] px-3 py-2.5 lg:px-4" data-email-edit-chat>
            <EmailEditChat
              embedded
              contentScore={contentScore}
              leadOutreachId={displayDraft.id}
              messages={displayDraft.editMessages ?? []}
              onDraftUpdated={(updated, messages) =>
                handleDraftUpdated({ ...updated, editMessages: messages })
              }
            />
          </div>
        ) : null}
      </div>
    </div>
  );
});

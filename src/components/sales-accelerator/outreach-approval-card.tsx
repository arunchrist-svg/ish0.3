"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
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
import {
  defaultSelectedContactEmails,
  EMPTY_SEND_TO_HINT,
  retainSelectedRecipientEmails,
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

export type ComposeActionState = {
  dirty: boolean;
  saving: boolean;
  sending: boolean;
  canSave: boolean;
  canSend: boolean;
  showSave: boolean;
  sendLabel: string;
  viewInEmailOnly: boolean;
};

export type OutreachApprovalHandle = {
  save: () => void;
  send: () => Promise<void>;
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
  onSavingChange?: (saving: boolean) => void;
  onComposeActionsChange?: (state: ComposeActionState | null) => void;
  onSent?: () => void;
  onSendFailed?: () => void;
  /** Position-1 draft used when starting the sequence from Draft 2/3. */
  startSequenceDraft?: WriterDraft;
  selectedEmails?: string[];
  onSelectedEmailsChange?: (emails: string[]) => void;
  chosenSubjectKey?: VariantKey;
  onChosenSubjectKeyChange?: (key: VariantKey) => void;
  onGenerateReply?: () => void;
  generatingReply?: boolean;
  contentScore?: number;
  emailThread?: EmailThread;
  scheduleIdForFollowUp?: string;
};

export { defaultSelectedContactEmails };

function CompareBodyField({
  value,
  onChange,
  disabled,
  editable,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  editable: boolean;
  placeholder?: string;
}) {
  if (!editable || disabled) {
    return (
      <p className={cn(text.body, "whitespace-pre-wrap text-[13px] leading-[1.65] text-brand-ink-soft")}>
        {value || placeholder}
      </p>
    );
  }
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className={cn(
        "block h-full min-h-[14rem] w-full resize-none overflow-y-auto border-0 bg-transparent px-0 py-0",
        text.body,
        "whitespace-pre-wrap text-[13px] leading-[1.65] placeholder:text-brand-ink-faint focus:outline-none focus:ring-0 disabled:opacity-60",
      )}
    />
  );
}

function EnvelopeRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-3 border-b border-brand-stratus-blue/10 px-4 py-3 last:border-b-0 lg:grid lg:grid-cols-[56px_1fr] lg:gap-3 lg:px-0 lg:py-3">
      <span className={cn(text.label, "w-10 shrink-0 text-[10px] lg:w-auto")}>{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
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
  onSavingChange,
  onComposeActionsChange,
  onSent,
  onSendFailed,
  startSequenceDraft,
  selectedEmails: selectedEmailsProp,
  onSelectedEmailsChange,
  chosenSubjectKey: chosenSubjectKeyProp,
  onChosenSubjectKeyChange,
  onGenerateReply,
  generatingReply,
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
  const [bodyPage, setBodyPage] = useState(1);
  const dirtyRef = useRef(false);
  const displayDraftRef = useRef(displayDraft);
  const subjectKeyRef = useRef(subjectKey);
  const bodyKeyRef = useRef(bodyKey);
  const onDraftUpdatedRef = useRef(onDraftUpdated);
  const lockedRef = useRef(false);

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
    return out;
  })();

  const [selectedEmailsLocal, setSelectedEmailsLocal] = useState<string[]>(() =>
    defaultSelectedContactEmails(contactEmail, contactEmails),
  );
  const selectedEmails = selectedEmailsProp ?? selectedEmailsLocal;
  function setSelectedEmails(next: string[] | ((prev: string[]) => string[])) {
    const resolved = typeof next === "function" ? next(selectedEmails) : next;
    if (onSelectedEmailsChange) onSelectedEmailsChange(resolved);
    else setSelectedEmailsLocal(resolved);
  }

  const isReplyDraft = draft.templateVariant === "reply" || draft.promptVersion?.includes("reply");
  const isFollowUpReview = Boolean(scheduleIdForFollowUp);
  const isSequenceFollowUp = isSequenceFollowUpDraft(draft.sequencePosition);
  const isDraftLocked =
    ["outreached", "meeting", "po_closed", "tasting_sent", "negotiate", "closed"].includes(leadStatus) ||
    Boolean(isReplyDraft && draft.replySent);
  const canSendToAdditional =
    isDraftLocked &&
    !isReplyDraft &&
    !isFollowUpReview &&
    (leadStatus === "outreached" || sentEmailKeys.size > 0);

  useEffect(() => {
    const defaults = defaultSelectedContactEmails(contactEmail, contactEmails);
    setSelectedEmails((prev) =>
      retainSelectedRecipientEmails(
        prev,
        selectableEmails.map((s) => s.email),
        sentEmailKeys,
        defaults,
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactEmail, contactEmails, leadStatus]);

  const subjectOptions = draftSubjectOptions(displayDraft);
  const bodyOptions = draftBodyOptions(displayDraft);
  const safeSubjectKey = subjectOptions.some((s) => s.key === subjectKey)
    ? subjectKey
    : (subjectOptions[0]?.key ?? "A");
  const safeBodyKey = bodyOptions.some((b) => b.key === bodyKey)
    ? bodyKey
    : (bodyOptions[0]?.key ?? "A");
  const bodyText = resolveDraftBody(displayDraft, safeBodyKey);

  dirtyRef.current = dirty;
  displayDraftRef.current = displayDraft;
  subjectKeyRef.current = subjectKey;
  bodyKeyRef.current = bodyKey;
  onDraftUpdatedRef.current = onDraftUpdated;
  lockedRef.current = isDraftLocked;

  useEffect(() => {
    setDisplayDraft(draft);
    if (!onChosenSubjectKeyChange) setSubjectKeyLocal(asVariantKey(draft.chosenSubjectKey));
    setBodyKey(asVariantKey(draft.chosenBodyKey));
    setDirty(false);
    // Only reset the editor when switching to a different draft. Same-id parent
    // refreshes must not wipe in-progress edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.id]);

  useEffect(() => {
    onSavingChange?.(saving);
  }, [saving, onSavingChange]);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/settings/email/sending")
      .then((r) => (r.ok ? r.json() : null))
      .then((cfg) => {
        if (cancelled || !cfg) return;
        setOutreachPaused(Boolean(cfg.outreachPaused));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

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
      try {
        const updated = await updateOutreachDraft({
          ...draftPatchPayload(displayDraft, subjectKey, bodyKey, payload),
          leadOutreachId: draft.id,
        });
        const next = {
          ...displayDraft,
          subjectA: updated.subjectA ?? displayDraft.subjectA,
          subjectB: updated.subjectB ?? displayDraft.subjectB,
          subjectC: updated.subjectC ?? displayDraft.subjectC,
          emailBody: updated.emailBody ?? displayDraft.emailBody,
          emailBodyB: updated.emailBodyB ?? displayDraft.emailBodyB,
          emailBodyC: updated.emailBodyC ?? displayDraft.emailBodyC,
          chosenSubjectKey: updated.chosenSubjectKey ?? subjectKey,
          chosenBodyKey: updated.chosenBodyKey ?? bodyKey,
        };
        setDisplayDraft(next);
        onDraftUpdated(next);
        setDirty(false);
        return true;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not save draft");
        return false;
      } finally {
        setSaving(false);
      }
    },
    [draft.id, displayDraft, onDraftUpdated, subjectKey, bodyKey],
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
    setDisplayDraft(updated);
    onDraftUpdated(updated);
    setDirty(false);
  }

  const activeSubject = resolveDraftSubject(displayDraft, safeSubjectKey);
  const threadSubject = followUpThreadSubject({
    threadRootSubject: emailThread?.threadRootSubject,
    email1Draft: startSequenceDraft,
    chosenSubjectKey: chosenSubjectKeyProp ?? startSequenceDraft?.chosenSubjectKey,
  });
  const showReRow = Boolean((isReplyDraft || isSequenceFollowUp) && threadSubject);

  function handleSubjectChange(key: VariantKey, value: string) {
    const field = key === "B" ? "subjectB" : key === "C" ? "subjectC" : "subjectA";
    setDisplayDraft({ ...displayDraft, [field]: value });
    setDirty(true);
  }

  function handleBodyChange(key: VariantKey, value: string) {
    const field = key === "B" ? "emailBodyB" : key === "C" ? "emailBodyC" : "emailBody";
    setDisplayDraft({ ...displayDraft, [field]: value });
    setDirty(true);
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
      toast.error(EMPTY_SEND_TO_HINT);
      return;
    }

    // Sequence always starts at Email 1, even when reviewing Draft 2/3.
    const sendDraft =
      !isReplyDraft &&
      !isFollowUpReview &&
      startSequenceDraft &&
      draft.sequencePosition != null &&
      draft.sequencePosition !== 1
        ? startSequenceDraft
        : displayDraft;

    const sendSubjectKey = safeSubjectKey;
    const sendBodyKey =
      sendDraft.id === displayDraft.id
        ? safeBodyKey
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
          chosenSubjectKey: safeSubjectKey,
          chosenBodyKey: safeBodyKey,
        });
        if (!saved) return;
        if (sendDraft.id !== displayDraft.id) {
          await updateOutreachDraft({
            leadOutreachId: sendDraft.id,
            chosenSubjectKey: safeSubjectKey,
          });
        }
      }

      if (isFollowUpReview && scheduleIdForFollowUp) {
        const result = await sendWithGateConfirm((overrides) =>
          sendFollowUp(scheduleIdForFollowUp, overrides),
        );
        toast.success(`Follow-up sent (${result.mode})`);
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

      const recipientsToSend = selectedEmails.filter(
        (email) => !sentEmailKeys.has(email.trim().toLowerCase()),
      );
      if (!recipientsToSend.length) {
        toast.error("Select a new email address to send to");
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

  function handleBodyStripScroll(e: { currentTarget: HTMLDivElement }) {
    const el = e.currentTarget;
    const count = Math.max(1, bodyOptions.length || 1);
    const cardWidth = el.scrollWidth / count;
    if (cardWidth <= 0) return;
    const page = Math.min(count, Math.max(1, Math.round(el.scrollLeft / cardWidth) + 1));
    setBodyPage(page);
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
    }),
    // Handlers close over latest state each render
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dirty, saving, sending, selectedEmails, displayDraft, safeSubjectKey, safeBodyKey, outreachPaused],
  );

  useEffect(() => {
    onComposeActionsChange?.({
      dirty,
      saving,
      sending,
      canSave: dirty && !saving && !sending && !canSendToAdditional,
      canSend: !sending && !saving && !outreachPaused && selectedEmails.length > 0,
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
    isDraftLocked,
    outreachPaused,
    selectedEmails.length,
    sendLabel,
    onComposeActionsChange,
  ]);

  return (
    <div
      id="approval-card"
      className="ish-email-compose min-w-0 bg-white lg:rounded-[22px] lg:border lg:border-brand-stratus-blue/20 lg:shadow-[var(--shadow-brand-sm)]"
    >
      <div className="flex min-w-0 flex-col p-0 lg:p-4">

        {isReplyDraft && !isDraftLocked && emailThread?.inboundSnippet && (
          <div className="mx-3 mb-2 mt-2 rounded-[12px] border border-brand-stratus-blue/22 bg-brand-green-soft px-3 py-2 lg:mx-0 lg:mt-0">
            <div className="mb-0.5 text-[9px] font-bold uppercase tracking-widest text-brand-stratus-blue">They said</div>
            <p className="line-clamp-2 text-[12px] leading-snug text-brand-ink-soft">{emailThread.inboundSnippet}</p>
          </div>
        )}

        {isReplyDraft && !isDraftLocked && onGenerateReply ? (
          <div className="flex justify-end px-3 py-1.5 lg:px-0">
            <button
              type="button"
              disabled={generatingReply || saving || sending}
              onClick={() => onGenerateReply()}
              className="inline-flex items-center gap-1.5 rounded-full border border-brand-stratus-blue/25 bg-white px-3 py-1.5 text-[12px] font-semibold text-brand-ink shadow-[var(--shadow-brand-sm)] transition-opacity hover:bg-brand-canvas disabled:opacity-50"
            >
              {generatingReply ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
              {generatingReply ? "Writing smart emails…" : "Regenerate reply"}
            </button>
          </div>
        ) : null}

        {showReRow ? (
          <div className="px-3 pt-2 lg:px-0">
            <EnvelopeRow label="Re">
              <p className="truncate text-[12px] font-semibold text-brand-stratus-blue">{threadSubject}</p>
            </EnvelopeRow>
          </div>
        ) : (
          <div className="px-3 pt-2.5 lg:px-0">
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              <p className="text-[11px] font-semibold text-brand-ink">Subject</p>
              <p className="text-[10px] text-brand-ink-faint">Applies to all three sequence emails</p>
            </div>
            <div
              className="grid grid-cols-1 gap-1.5 sm:grid-cols-3"
              role="radiogroup"
              aria-label="Subject options"
            >
              {(subjectOptions.length ? subjectOptions : [{ key: "A" as const, value: activeSubject }]).map(
                (option) => {
                  const checked = option.key === safeSubjectKey;
                  return (
                    <div
                      key={option.key}
                      role="radio"
                      aria-checked={checked}
                      tabIndex={isDraftLocked ? -1 : 0}
                      onClick={() => {
                        if (isDraftLocked) return;
                        setSubjectKey(option.key);
                        setDirty(true);
                      }}
                      onKeyDown={(e) => {
                        if (isDraftLocked) return;
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSubjectKey(option.key);
                          setDirty(true);
                        }
                      }}
                      className={cn(
                        "ish-email-choice flex min-w-0 cursor-pointer flex-col gap-1 rounded-[12px] border px-2.5 py-2 transition-colors",
                        checked
                          ? "border-brand-stratus-blue/40 bg-white shadow-[var(--shadow-brand-sm)]"
                          : "border-transparent bg-white/70 hover:border-brand-stratus-blue/20 hover:bg-white",
                        isDraftLocked && "cursor-default opacity-60",
                      )}
                    >
                      <span className="text-[9px] font-semibold uppercase tracking-wide text-brand-ink-faint">
                        {option.key}
                      </span>
                      {checked && !isDraftLocked ? (
                        <input
                          type="text"
                          value={option.value}
                          onChange={(e) => handleSubjectChange(option.key, e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          placeholder={`Subject ${option.key}`}
                          className={cn(
                            "w-full border-0 bg-transparent px-0 py-0 leading-snug",
                            text.body,
                            "text-[12px] font-medium placeholder:text-brand-ink-faint focus:outline-none focus:ring-0",
                          )}
                        />
                      ) : (
                        <p className="line-clamp-2 text-[12px] font-medium leading-snug text-brand-ink">
                          {option.value}
                        </p>
                      )}
                    </div>
                  );
                },
              )}
            </div>
          </div>
        )}

        <div className="ish-email-body relative mt-2.5 min-w-0 px-0 pt-2 lg:rounded-[14px] lg:border lg:border-brand-stratus-blue/15 lg:bg-brand-canvas/25 lg:px-3 lg:pt-2.5 lg:shadow-[var(--shadow-brand-sm)]">
          <div className="mb-1.5 flex items-center justify-between gap-3 px-3 lg:px-0">
            <p className="text-[11px] font-semibold text-brand-ink">Body</p>
            <p className="text-[10px] text-brand-ink-faint">
              {bodyOptions.length > 1 ? (
                <span className="lg:hidden">{bodyPage} / {bodyOptions.length} · </span>
              ) : null}
              {displayDraft.draftSource} · {displayDraft.revisionCount ?? 0} rev
              {displayDraft.rubricTotal != null ? ` · rubric ${displayDraft.rubricTotal}` : ""}
            </p>
          </div>
          <div
            className="flex gap-2 overflow-x-auto px-3 pb-2 snap-x snap-mandatory scrollbar-none lg:grid lg:grid-cols-3 lg:overflow-visible lg:px-0 lg:pb-2.5"
            role="radiogroup"
            aria-label="Body options"
            onScroll={handleBodyStripScroll}
          >
            {(bodyOptions.length ? bodyOptions : [{ key: "A" as const, value: bodyText }]).map((option) => {
              const checked = option.key === safeBodyKey;
              return (
                <div
                  key={option.key}
                  role="radio"
                  aria-checked={checked}
                  tabIndex={isDraftLocked ? -1 : 0}
                  onClick={() => {
                    if (isDraftLocked) return;
                    setBodyKey(option.key);
                    setDirty(true);
                  }}
                  onKeyDown={(e) => {
                    if (isDraftLocked) return;
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setBodyKey(option.key);
                      setDirty(true);
                    }
                  }}
                  className={cn(
                    "ish-email-choice flex w-[85%] shrink-0 snap-center flex-col rounded-[12px] border p-2.5 transition-colors lg:w-auto lg:min-w-0",
                    "min-h-[13rem] max-h-[21rem]",
                    checked
                      ? "border-brand-stratus-blue/40 bg-white shadow-[var(--shadow-brand-sm)]"
                      : "border-transparent bg-white/70 hover:border-brand-stratus-blue/20 hover:bg-white",
                    isDraftLocked ? "cursor-default opacity-60" : "cursor-pointer",
                  )}
                >
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <p className="text-[9px] font-semibold uppercase tracking-wide text-brand-ink-faint">
                      {option.key}
                    </p>
                  </div>
                  <div
                    className="min-h-0 flex-1 overflow-y-auto"
                    onClick={(e) => {
                      if (checked) e.stopPropagation();
                    }}
                    onKeyDown={(e) => {
                      if (checked) e.stopPropagation();
                    }}
                  >
                    <CompareBodyField
                      value={option.value}
                      onChange={(value) => handleBodyChange(option.key, value)}
                      disabled={isDraftLocked}
                      editable={checked}
                      placeholder="Write your message…"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {!isDraftLocked && (
          <div className="mt-2 px-0 lg:px-0">
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
        )}
      </div>
    </div>
  );
});

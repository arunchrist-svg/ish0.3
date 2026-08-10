"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Loader2, Mail, Save, Send, Sparkles, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ContactEmailEntry, EmailThread, WriterDraft } from "@/lib/api-client";
import {
  approveOutreach,
  sendOutreach,
  sendFollowUp,
  updateOutreachDraft,
  SenderPreflightApiError,
  EmailSendRejectedError,
  fetchSenderHealth,
  type SenderHealthResponse,
} from "@/lib/api-client";
import { text } from "@/design-system/tokens";
import { toast } from "sonner";
import { EmailEditChat } from "./email-edit-chat";
import {
  asVariantKey,
  draftBodyOptions,
  draftSubjectOptions,
  resolveDraftBody,
  resolveDraftSubject,
  type VariantKey,
} from "@/lib/email/draft-variants";

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
  onSent?: () => void;
  onSendFailed?: () => void;
  onGenerateReply?: () => void;
  generatingReply?: boolean;
  contentScore?: number;
  emailThread?: EmailThread;
  scheduleIdForFollowUp?: string;
};

function useAutoGrowTextarea(value: string) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const resize = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  }, []);
  useEffect(() => {
    resize();
  }, [value, resize]);
  return { ref, resize };
}

function AutoGrowBodyTextarea({
  value,
  onChange,
  disabled,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const { ref, resize } = useAutoGrowTextarea(value);
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => {
        onChange(e.target.value);
        requestAnimationFrame(resize);
      }}
      placeholder={placeholder}
      rows={1}
      disabled={disabled}
      className={cn(
        "block w-full resize-none overflow-hidden border-0 bg-transparent px-0 py-0",
        text.body,
        "min-h-[8rem] whitespace-pre-wrap leading-[1.65] placeholder:text-brand-ink-faint focus:outline-none focus:ring-0 disabled:opacity-60 lg:min-h-[6rem] lg:leading-[1.7]",
      )}
    />
  );
}

function EnvelopeRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-2 border-b border-brand-border/30 px-3 py-2.5 last:border-b-0 lg:grid lg:grid-cols-[52px_1fr] lg:gap-2 lg:px-0 lg:py-2">
      <span className={cn(text.label, "w-10 shrink-0 text-[10px] lg:w-auto")}>{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function OutreachApprovalCard({
  draft,
  leadId,
  leadStatus,
  contactName,
  companyName,
  contactEmail,
  contactEmails,
  onDraftUpdated,
  onSavingChange,
  onSent,
  onSendFailed,
  onGenerateReply,
  generatingReply,
  contentScore,
  emailThread,
  scheduleIdForFollowUp,
}: Props) {
  const [subjectKey, setSubjectKey] = useState<VariantKey>(() => asVariantKey(draft.chosenSubjectKey));
  const [bodyKey, setBodyKey] = useState<VariantKey>(() => asVariantKey(draft.chosenBodyKey));
  const [displayDraft, setDisplayDraft] = useState(draft);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [sending, setSending] = useState(false);
  const [senderHealth, setSenderHealth] = useState<SenderHealthResponse | null>(null);
  const [preflightOverrideAck, setPreflightOverrideAck] = useState(false);
  const [qualityOverrideAck, setQualityOverrideAck] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [outreachPaused, setOutreachPaused] = useState(false);
  const [fromLabel, setFromLabel] = useState<string | null>(null);

  const selectableEmails = (() => {
    const seen = new Set<string>();
    const out: { email: string; label?: string; isPrimary: boolean }[] = [];
    const add = (email: string, label?: string, isPrimary = false) => {
      const key = email.trim().toLowerCase();
      if (!key || !key.includes("@") || key === "—" || seen.has(key)) return;
      seen.add(key);
      out.push({ email: email.trim(), label, isPrimary });
    };
    if (contactEmail?.trim()) add(contactEmail.trim(), "Fetched", true);
    for (const entry of contactEmails ?? []) {
      const isPrimary =
        Boolean(contactEmail?.trim()) &&
        entry.email.trim().toLowerCase() === contactEmail!.trim().toLowerCase();
      const label =
        entry.pattern === "first.last"
          ? "first.last@company"
          : entry.enrichmentProvider === "permutation"
            ? entry.pattern ?? "Guessed"
            : isPrimary
              ? "Fetched"
              : undefined;
      add(entry.email, label, isPrimary);
    }
    return out;
  })();

  const canChooseMultiple = selectableEmails.length > 1;
  const [selectedEmails, setSelectedEmails] = useState<string[]>(() =>
    selectableEmails.length
      ? selectableEmails.filter((e) => e.isPrimary).map((e) => e.email).length
        ? selectableEmails.filter((e) => e.isPrimary).map((e) => e.email)
        : [selectableEmails[0].email]
      : contactEmail?.trim()
        ? [contactEmail.trim()]
        : [],
  );

  useEffect(() => {
    const defaults = selectableEmails.length
      ? selectableEmails.some((e) => e.isPrimary)
        ? selectableEmails.filter((e) => e.isPrimary).map((e) => e.email)
        : [selectableEmails[0].email]
      : contactEmail?.trim()
        ? [contactEmail.trim()]
        : [];
    setSelectedEmails((prev) => {
      const stillValid = prev.filter((e) =>
        selectableEmails.some((s) => s.email.toLowerCase() === e.toLowerCase()),
      );
      return stillValid.length ? stillValid : defaults;
    });
    // selectableEmails is derived from props; re-sync when contact emails change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactEmail, contactEmails]);

  const subjectOptions = draftSubjectOptions(displayDraft);
  const bodyOptions = draftBodyOptions(displayDraft);
  const safeSubjectKey = subjectOptions.some((s) => s.key === subjectKey)
    ? subjectKey
    : (subjectOptions[0]?.key ?? "A");
  const safeBodyKey = bodyOptions.some((b) => b.key === bodyKey)
    ? bodyKey
    : (bodyOptions[0]?.key ?? "A");
  const bodyText = resolveDraftBody(displayDraft, safeBodyKey);

  const isReplyDraft = draft.templateVariant === "reply" || draft.promptVersion?.includes("reply");
  const isFollowUpReview = Boolean(scheduleIdForFollowUp);
  const canSend = isReplyDraft || isFollowUpReview || !draft.sequencePosition || draft.sequencePosition === 1;
  const senderBlocked = Boolean(senderHealth?.hasCritical && !preflightOverrideAck);
  const qualityBlocked =
    !isReplyDraft &&
    Boolean(
      displayDraft.revisionTimeout ||
        (displayDraft.rubricTotal != null &&
          displayDraft.rubricTotal < 80) ||
        (displayDraft.deliverabilityScore != null && displayDraft.deliverabilityScore < 80),
    ) &&
    !qualityOverrideAck;

  const isDraftLocked =
    ["outreached", "meeting", "po_closed", "tasting_sent", "negotiate", "closed"].includes(leadStatus) ||
    (isReplyDraft && draft.replySent);

  useEffect(() => {
    setDisplayDraft(draft);
    setSubjectKey(asVariantKey(draft.chosenSubjectKey));
    setBodyKey(asVariantKey(draft.chosenBodyKey));
    setDirty(false);
  }, [draft]);

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
    void fetch("/api/settings/email")
      .then((r) => (r.ok ? r.json() : null))
      .then((cfg) => {
        if (cancelled || !cfg) return;
        const name = cfg.fromName?.trim();
        const addr = cfg.fromAddress?.trim();
        if (name && addr) setFromLabel(`${name} <${addr}>`);
        else if (addr) setFromLabel(addr);
        else if (name) setFromLabel(name);
      })
      .catch(() => {});
    void fetchSenderHealth()
      .then((h) => {
        if (!cancelled) setSenderHealth(h);
      })
      .catch(() => {
        if (!cancelled) setSenderHealth(null);
      });
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
          leadOutreachId: draft.id,
          subjectA: payload?.subjectA ?? displayDraft.subjectA,
          subjectB: payload?.subjectB ?? displayDraft.subjectB,
          subjectC: payload?.subjectC ?? displayDraft.subjectC,
          emailBody: payload?.emailBody ?? displayDraft.emailBody,
          emailBodyB: payload?.emailBodyB ?? displayDraft.emailBodyB,
          emailBodyC: payload?.emailBodyC ?? displayDraft.emailBodyC,
          chosenSubjectKey: payload?.chosenSubjectKey ?? subjectKey,
          chosenBodyKey: payload?.chosenBodyKey ?? bodyKey,
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

  async function handleSave() {
    const ok = await persistDraft();
    if (ok) toast.success("Draft saved");
  }

  function handleDraftUpdated(updated: WriterDraft) {
    setDisplayDraft(updated);
    onDraftUpdated(updated);
    setDirty(false);
  }

  const activeSubject = resolveDraftSubject(displayDraft, safeSubjectKey);
  const threadSubject = emailThread?.threadRootSubject;
  const showReRow = Boolean(isReplyDraft && threadSubject);
  const toLine = [contactName, companyName].filter(Boolean).join(" · ");
  const selectedSummary =
    selectedEmails.length > 1
      ? `${selectedEmails.length} addresses`
      : selectedEmails[0] ?? contactEmail?.trim();
  const toDetail = selectedSummary
    ? `${toLine || "Contact"} · ${selectedSummary}`
    : toLine || "Add contact email";

  function toggleRecipient(email: string) {
    setSelectedEmails((prev) => {
      if (prev.some((e) => e.toLowerCase() === email.toLowerCase())) {
        const next = prev.filter((e) => e.toLowerCase() !== email.toLowerCase());
        return next.length ? next : prev;
      }
      return [...prev, email];
    });
  }

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


  async function handleReject() {
    setRejecting(true);
    try {
      await approveOutreach({
        leadOutreachId: displayDraft.id,
        leadId,
        channel: "email",
        status: "rejected",
        rejectReason: "not_ready",
      });
      toast.success("Draft rejected");
      onSendFailed?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not reject draft");
    } finally {
      setRejecting(false);
    }
  }

  async function handleSendToOutreach() {
    if (outreachPaused) {
      toast.error("Outreach sending is paused. Resume in Email queue or Settings.");
      return;
    }
    if (!selectedEmails.length) {
      toast.error("Select at least one email address before sending");
      return;
    }
    const subjectToSend = isReplyDraft && threadSubject ? threadSubject : activeSubject;
    const bodyToSend = bodyText;
    if (!subjectToSend?.trim() || !bodyToSend.trim()) {
      toast.error("Subject and body are required");
      return;
    }

    setSending(true);
    try {
      const saved = await persistDraft({
        chosenSubjectKey: safeSubjectKey,
        chosenBodyKey: safeBodyKey,
      });
      if (!saved) return;

      if (isFollowUpReview && scheduleIdForFollowUp) {
        const result = await sendFollowUp(scheduleIdForFollowUp, {
          overridePreflight: preflightOverrideAck,
          overrideQualityGate: qualityOverrideAck,
        });
        toast.success(`Follow-up sent (${result.mode})`);
        onSent?.();
        return;
      }

      const { approvalId } = await approveOutreach({
        leadOutreachId: displayDraft.id,
        leadId,
        channel: "email",
        status: "approved",
        subjectUsed: subjectToSend,
        bodyUsed: bodyToSend,
      });

      const result = await sendOutreach(approvalId, {
        overridePreflight: preflightOverrideAck,
        overrideQualityGate: qualityOverrideAck,
        toEmails: selectedEmails,
      });
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

  return (
    <div
      id="approval-card"
      className="overflow-hidden bg-white lg:ish-record-card lg:rounded-[20px] lg:border lg:border-brand-border/60 lg:shadow-[var(--shadow-brand-sm)]"
    >
      <div className="flex flex-col p-0 lg:p-5">

        {!isDraftLocked && qualityBlocked ? (
          <div className="mx-3 mb-2 mt-2 rounded-[10px] border border-amber-300/60 bg-amber-50 px-3 py-2 text-[11px] text-amber-900 lg:mx-0 lg:mb-3 lg:mt-0 lg:rounded-[14px] lg:px-3.5 lg:py-2.5">
            {displayDraft.revisionTimeout
              ? "This draft did not pass automated quality checks after revision."
              : "Inbox or rubric score is below the recommended threshold."}
            {" "}
            <button
              type="button"
              className="font-semibold underline"
              onClick={() => setQualityOverrideAck(true)}
            >
              Send anyway
            </button>
          </div>
        ) : null}

        {isReplyDraft && !isDraftLocked && emailThread?.inboundSnippet && (
          <div className="mx-3 mb-3 mt-1 rounded-[10px] border border-brand-stratus-blue/22 bg-brand-green-soft px-3 py-2.5 lg:mx-0 lg:mb-3 lg:mt-0 lg:rounded-[14px] lg:px-3.5 lg:py-2.5">
            <div className="mb-1 text-[9px] font-bold uppercase tracking-widest text-brand-stratus-blue">They said</div>
            <p className="text-[11px] leading-relaxed text-brand-ink-soft">{emailThread.inboundSnippet}</p>
          </div>
        )}

        <div className="border-b border-brand-border/40 lg:rounded-[14px] lg:border lg:border-brand-stratus-blue/15 lg:bg-brand-canvas/25 lg:px-3.5 lg:py-1">
          <div className="flex flex-col border-b border-brand-border/30 lg:flex-row lg:items-center">
            <div className="flex min-w-0 items-center gap-2 px-3 py-2.5 lg:flex-1 lg:gap-2 lg:px-0 lg:py-2">
              <span className={cn(text.label, "w-10 shrink-0 text-[10px] lg:w-[52px]")}>To</span>
              <p className="min-w-0 flex-1 text-[13px] font-medium leading-snug text-brand-ink break-all lg:truncate lg:text-[12px]">{toDetail}</p>
            </div>
            {fromLabel ? (
              <div className="flex min-w-0 items-center gap-2 border-t border-brand-border/30 px-3 py-2.5 lg:flex-1 lg:gap-2 lg:border-t-0 lg:border-l lg:px-0 lg:py-2 lg:pl-4">
                <span className={cn(text.label, "w-10 shrink-0 text-[10px] lg:w-[52px]")}>From</span>
                <p className="min-w-0 flex-1 text-[13px] leading-snug text-brand-ink-soft break-all lg:truncate lg:text-[12px]">{fromLabel}</p>
              </div>
            ) : null}
          </div>
          {canChooseMultiple && !isDraftLocked ? (
            <div className="border-t border-brand-border/30 px-3 py-2.5 lg:px-0 lg:py-2">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-brand-ink-soft">
                Send to
              </p>
              <div className="flex flex-col gap-1.5">
                {selectableEmails.map((entry) => {
                  const checked = selectedEmails.some(
                    (e) => e.toLowerCase() === entry.email.toLowerCase(),
                  );
                  return (
                    <label
                      key={entry.email}
                      className="flex cursor-pointer items-start gap-2 rounded-[10px] px-1 py-1 hover:bg-white/60"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleRecipient(entry.email)}
                        className="mt-0.5 size-3.5 shrink-0 rounded border-brand-border text-brand-stratus-blue focus:ring-brand-stratus-blue/30"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block break-all text-[12px] font-medium text-brand-ink">
                          {entry.email}
                        </span>
                        {entry.label ? (
                          <span className="text-[10px] text-brand-ink-faint">{entry.label}</span>
                        ) : null}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          ) : null}
          {showReRow ? (
            <EnvelopeRow label="Re">
              <p className="truncate text-[12px] font-semibold text-brand-stratus-blue">{threadSubject}</p>
            </EnvelopeRow>
          ) : (
            <div className="border-t border-brand-border/30 px-3 py-2.5 lg:px-0 lg:py-2">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-brand-ink-soft">
                Subject (pick 1)
              </p>
              <div className="flex flex-col gap-2">
                {(subjectOptions.length ? subjectOptions : [{ key: "A" as const, value: activeSubject }]).map(
                  (option) => {
                    const checked = option.key === safeSubjectKey;
                    return (
                      <label
                        key={option.key}
                        className={cn(
                          "flex cursor-pointer items-start gap-2 rounded-[10px] border px-2 py-1.5",
                          checked
                            ? "border-brand-stratus-blue/40 bg-white"
                            : "border-transparent hover:bg-white/60",
                        )}
                      >
                        <input
                          type="radio"
                          name={`subject-${draft.id}`}
                          checked={checked}
                          disabled={isDraftLocked}
                          onChange={() => {
                            setSubjectKey(option.key);
                            setDirty(true);
                          }}
                          className="mt-1.5 size-3.5 shrink-0 border-brand-border text-brand-stratus-blue focus:ring-brand-stratus-blue/30"
                        />
                        <input
                          type="text"
                          value={option.value}
                          onChange={(e) => handleSubjectChange(option.key, e.target.value)}
                          placeholder={`Subject ${option.key}`}
                          disabled={isDraftLocked}
                          className={cn(
                            "min-w-0 flex-1 border-0 bg-transparent px-0 py-0",
                            text.body,
                            "text-[13px] placeholder:text-brand-ink-faint lg:text-[12px]",
                            "focus:outline-none focus:ring-0 disabled:opacity-60",
                          )}
                        />
                      </label>
                    );
                  },
                )}
              </div>
            </div>
          )}
        </div>

        {isReplyDraft && !isDraftLocked && onGenerateReply ? (
          <div className="flex justify-end px-3 py-2 lg:mt-3 lg:px-0 lg:py-0">
            <button
              type="button"
              disabled={generatingReply || saving || sending}
              onClick={() => onGenerateReply()}
              className="inline-flex items-center gap-2 rounded-full border border-brand-border bg-white px-4 py-2 text-[12px] font-semibold text-brand-ink shadow-[var(--shadow-brand-sm)] transition-opacity hover:bg-brand-canvas disabled:opacity-50"
            >
              {generatingReply ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
              {generatingReply ? "Writing smart emails…" : "Regenerate reply"}
            </button>
          </div>
        ) : null}

        <div className="relative mt-2 border-t border-brand-border/40 pt-2 lg:mt-3 lg:rounded-[16px] lg:border lg:border-brand-border/50 lg:bg-white lg:pt-3 lg:shadow-[var(--shadow-brand-sm)]">
          <p className="px-3 text-[10px] font-semibold uppercase tracking-wide text-brand-ink-soft lg:px-5">
            Body (pick 1)
          </p>
          <div className="mt-2 flex flex-col gap-2 px-3 pb-2 lg:px-5">
            {(bodyOptions.length ? bodyOptions : [{ key: "A" as const, value: bodyText }]).map((option) => {
              const checked = option.key === safeBodyKey;
              return (
                <div
                  key={option.key}
                  className={cn(
                    "flex items-start gap-2 rounded-[12px] border px-2.5 py-2",
                    checked
                      ? "border-brand-stratus-blue/40 bg-brand-canvas/40"
                      : "border-brand-border/40 hover:bg-brand-canvas/25",
                  )}
                >
                  <input
                    type="radio"
                    name={`body-${draft.id}`}
                    checked={checked}
                    disabled={isDraftLocked}
                    onChange={() => {
                      setBodyKey(option.key);
                      setDirty(true);
                    }}
                    className="mt-1 size-3.5 shrink-0 cursor-pointer border-brand-border text-brand-stratus-blue focus:ring-brand-stratus-blue/30"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-brand-ink-faint">
                      Option {option.key}
                    </p>
                    <AutoGrowBodyTextarea
                      value={option.value}
                      onChange={(value) => handleBodyChange(option.key, value)}
                      disabled={isDraftLocked}
                      placeholder="Write your message…"
                    />
                  </div>
                </div>
              );
            })}
          </div>
          {!isDraftLocked && (
            <EmailEditChat
              embedded
              contentScore={contentScore}
              leadOutreachId={displayDraft.id}
              messages={displayDraft.editMessages ?? []}
              onDraftUpdated={(updated, messages) =>
                handleDraftUpdated({ ...updated, editMessages: messages })
              }
            />
          )}
          <div className="pointer-events-none absolute right-3 top-2 text-[9px] text-brand-ink-faint/80">
            {displayDraft.draftSource} · {displayDraft.revisionCount ?? 0} rev
            {displayDraft.rubricTotal != null ? ` · rubric ${displayDraft.rubricTotal}` : ""}
          </div>
        </div>

        <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-end gap-2 border-t border-brand-border/50 bg-white/95 px-3 py-2.5 backdrop-blur-sm lg:static lg:mt-3 lg:border-0 lg:bg-transparent lg:px-0 lg:py-0">
          {isDraftLocked ? (
            <Link
              href="/email?tab=active"
              className="text-[12px] font-semibold text-brand-stratus-blue underline-offset-2 hover:underline lg:inline-flex lg:items-center lg:gap-2 lg:rounded-full lg:bg-brand-black lg:px-4 lg:py-2 lg:text-white lg:no-underline lg:shadow-[var(--shadow-brand-sm)] lg:transition-opacity lg:hover:opacity-90"
            >
              <Mail className="hidden size-3.5 lg:block" />
              View in Outreach Queue
            </Link>
          ) : (
            <>
              {dirty ? (
                <span className="text-[10px] font-medium text-amber-700">Unsaved changes</span>
              ) : saving ? (
                <span className="text-[10px] text-brand-ink-faint">Saving…</span>
              ) : null}
              <button
                type="button"
                onClick={() => void handleReject()}
                disabled={rejecting || saving || sending}
                className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-white px-4 py-2 text-[12px] font-semibold text-red-700 shadow-[var(--shadow-brand-sm)] transition-opacity hover:bg-red-50 disabled:opacity-50"
              >
                {rejecting ? <Loader2 className="size-3.5 animate-spin" /> : <XCircle className="size-3.5" />}
                Reject
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving || sending || !dirty}
                className="inline-flex items-center gap-2 rounded-full border border-brand-border bg-white px-4 py-2 text-[12px] font-semibold text-brand-ink shadow-[var(--shadow-brand-sm)] transition-opacity hover:bg-brand-canvas disabled:opacity-50"
              >
                {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                {saving ? "Saving…" : "Save draft"}
              </button>
              {!canSend ? (
                <p className="text-[11px] text-brand-ink-faint">Follow-ups send on schedule</p>
              ) : (
                <div className="flex flex-col items-end gap-1.5">
                  {senderBlocked && senderHealth ? (
                    <div className="max-w-sm text-right text-[10px] text-red-600">
                      {senderHealth.issues
                        .filter((i) => i.severity === "critical")
                        .map((i) => i.label)
                        .join(" · ")}
                      <button
                        type="button"
                        className="ml-2 font-semibold underline"
                        onClick={() => setPreflightOverrideAck(true)}
                      >
                        Send anyway
                      </button>
                    </div>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void handleSendToOutreach()}
                    disabled={sending || saving || outreachPaused || senderBlocked || qualityBlocked}
                    className="inline-flex items-center gap-2 rounded-full bg-brand-black px-4 py-2 text-[12px] font-semibold text-white shadow-[var(--shadow-brand-sm)] transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {sending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                    {sending ? "Sending…" : isFollowUpReview ? "Send follow-up" : isReplyDraft ? "Send Reply" : "Send & start sequence"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

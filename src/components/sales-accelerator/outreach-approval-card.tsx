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
  onOpenFirstEmail?: () => void;
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
        "min-h-[5rem] whitespace-pre-wrap leading-[1.55] placeholder:text-brand-ink-faint focus:outline-none focus:ring-0 disabled:opacity-60 lg:min-h-[4.5rem] lg:leading-[1.6]",
      )}
    />
  );
}

function EnvelopeRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-2 border-b border-brand-border/30 px-3 py-1.5 last:border-b-0 lg:grid lg:grid-cols-[52px_1fr] lg:gap-2 lg:px-0 lg:py-1.5">
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
  onOpenFirstEmail,
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
          overridePreflight: true,
          overrideQualityGate: true,
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
        overridePreflight: true,
        overrideQualityGate: true,
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
      className="ish-email-compose min-w-0 overflow-x-hidden overflow-y-hidden bg-white lg:rounded-[20px] lg:border lg:border-brand-border/60 lg:shadow-[var(--shadow-brand-sm)]"
    >
      <div className="flex min-w-0 flex-col p-0 lg:p-3">

        {isReplyDraft && !isDraftLocked && emailThread?.inboundSnippet && (
          <div className="mx-3 mb-2 mt-1 rounded-[10px] border border-brand-stratus-blue/22 bg-brand-green-soft px-2.5 py-1.5 lg:mx-0 lg:mb-2 lg:mt-0 lg:rounded-[12px] lg:px-3 lg:py-1.5">
            <div className="mb-0.5 text-[9px] font-bold uppercase tracking-widest text-brand-stratus-blue">They said</div>
            <p className="text-[11px] leading-snug text-brand-ink-soft">{emailThread.inboundSnippet}</p>
          </div>
        )}

        <div className="min-w-0 border-b border-brand-border/40 lg:rounded-[12px] lg:border lg:border-brand-stratus-blue/15 lg:bg-brand-canvas/25 lg:px-3 lg:py-0.5">
          <div className="flex min-w-0 flex-col border-b border-brand-border/30 lg:flex-row lg:items-center">
            <div className="flex min-w-0 items-center gap-2 px-3 py-1.5 lg:min-w-0 lg:flex-1 lg:gap-2 lg:px-0 lg:py-1.5">
              <span className={cn(text.label, "w-10 shrink-0 text-[10px] lg:w-[52px]")}>To</span>
              <p className="min-w-0 flex-1 break-words text-[13px] font-medium leading-snug text-brand-ink lg:truncate lg:text-[12px]">{toDetail}</p>
            </div>
            {fromLabel ? (
              <div className="flex min-w-0 items-center gap-2 border-t border-brand-border/30 px-3 py-1.5 lg:min-w-0 lg:flex-1 lg:gap-2 lg:border-t-0 lg:border-l lg:px-0 lg:py-1.5 lg:pl-3">
                <span className={cn(text.label, "w-10 shrink-0 text-[10px] lg:w-[52px]")}>From</span>
                <p className="min-w-0 flex-1 break-words text-[13px] leading-snug text-brand-ink-soft lg:truncate lg:text-[12px]">{fromLabel}</p>
              </div>
            ) : null}
          </div>
          {canChooseMultiple && !isDraftLocked ? (
            <div className="border-t border-brand-border/30 px-3 py-1.5 lg:px-0 lg:py-1.5">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-brand-ink-soft">
                Send to
              </p>
              <div className="flex flex-col gap-0.5">
                {selectableEmails.map((entry) => {
                  const checked = selectedEmails.some(
                    (e) => e.toLowerCase() === entry.email.toLowerCase(),
                  );
                  return (
                    <label
                      key={entry.email}
                      className="flex cursor-pointer items-center gap-2 rounded-[8px] px-1 py-0.5 hover:bg-white/60"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleRecipient(entry.email)}
                        className="size-3.5 shrink-0 rounded border-brand-border text-brand-stratus-blue focus:ring-brand-stratus-blue/30"
                      />
                      <span className="min-w-0 flex-1 leading-tight">
                        <span className="block break-all text-[12px] font-medium text-brand-ink">
                          {entry.email}
                        </span>
                        {entry.label ? (
                          <span className="text-[10px] leading-none text-brand-ink-faint">{entry.label}</span>
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
            <div className="border-t border-brand-border/30 px-3 py-1.5 lg:px-0 lg:py-1.5">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-brand-ink-soft">
                Subject (pick 1)
              </p>
              <div className="flex flex-col gap-1" role="radiogroup" aria-label="Subject options">
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
                          "ish-email-choice flex min-w-0 cursor-pointer items-center gap-2 rounded-[10px] border px-2.5 py-1.5 transition-colors",
                          checked
                            ? "border-brand-stratus-blue/45 bg-brand-stratus-blue/8"
                            : "border-brand-border/40 bg-white/70 hover:border-brand-stratus-blue/25 hover:bg-white",
                          isDraftLocked && "cursor-default opacity-60",
                        )}
                      >
                        <span
                          aria-hidden
                          className={cn(
                            "flex size-4 shrink-0 items-center justify-center rounded-full border-2",
                            checked
                              ? "border-brand-stratus-blue bg-brand-stratus-blue"
                              : "border-brand-border bg-white",
                          )}
                        >
                          {checked ? <span className="size-1.5 rounded-full bg-white" /> : null}
                        </span>
                        <input
                          type="text"
                          value={option.value}
                          onChange={(e) => handleSubjectChange(option.key, e.target.value)}
                          onFocus={() => {
                            if (isDraftLocked) return;
                            setSubjectKey(option.key);
                            setDirty(true);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          placeholder={`Subject ${option.key}`}
                          disabled={isDraftLocked}
                          className={cn(
                            "min-w-0 flex-1 border-0 bg-transparent px-0 py-0 leading-normal",
                            text.body,
                            "text-[13px] placeholder:text-brand-ink-faint lg:text-[12px]",
                            "focus:outline-none focus:ring-0 disabled:opacity-60",
                          )}
                        />
                      </div>
                    );
                  },
                )}
              </div>
            </div>
          )}
        </div>

        {isReplyDraft && !isDraftLocked && onGenerateReply ? (
          <div className="flex justify-end px-3 py-1.5 lg:mt-2 lg:px-0 lg:py-0">
            <button
              type="button"
              disabled={generatingReply || saving || sending}
              onClick={() => onGenerateReply()}
              className="inline-flex items-center gap-2 rounded-full border border-brand-border bg-white px-3 py-1.5 text-[12px] font-semibold text-brand-ink shadow-[var(--shadow-brand-sm)] transition-opacity hover:bg-brand-canvas disabled:opacity-50"
            >
              {generatingReply ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
              {generatingReply ? "Writing smart emails…" : "Regenerate reply"}
            </button>
          </div>
        ) : null}

        <div className="ish-email-body relative mt-1.5 min-w-0 overflow-x-hidden border-t border-brand-border/40 pt-1.5 lg:mt-2 lg:rounded-[14px] lg:border lg:border-brand-border/50 lg:bg-white lg:pt-2 lg:shadow-[var(--shadow-brand-sm)]">
          <p className="px-3 text-[10px] font-semibold uppercase tracking-wide text-brand-ink-soft lg:px-3.5">
            Body (pick 1)
          </p>
          <div className="mt-1 flex flex-col gap-1 px-3 pb-1.5 lg:px-3.5" role="radiogroup" aria-label="Body options">
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
                    "ish-email-choice flex min-w-0 items-start gap-2 rounded-[10px] border px-2.5 py-1.5 transition-colors",
                    checked
                      ? "border-brand-stratus-blue/45 bg-brand-stratus-blue/8"
                      : "border-brand-border/40 bg-white/70 hover:border-brand-stratus-blue/25 hover:bg-white",
                    isDraftLocked ? "cursor-default opacity-60" : "cursor-pointer",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border-2",
                      checked
                        ? "border-brand-stratus-blue bg-brand-stratus-blue"
                        : "border-brand-border bg-white",
                    )}
                  >
                    {checked ? <span className="size-1.5 rounded-full bg-white" /> : null}
                  </span>
                  <div
                    className="min-w-0 flex-1"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-ink-faint">
                      Option {option.key}
                    </p>
                    <AutoGrowBodyTextarea
                      value={option.value}
                      onChange={(value) => {
                        if (!checked) {
                          setBodyKey(option.key);
                          setDirty(true);
                        }
                        handleBodyChange(option.key, value);
                      }}
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
          <div className="pointer-events-none absolute right-2.5 top-1.5 text-[9px] text-brand-ink-faint/80">
            {displayDraft.draftSource} · {displayDraft.revisionCount ?? 0} rev
            {displayDraft.rubricTotal != null ? ` · rubric ${displayDraft.rubricTotal}` : ""}
          </div>
        </div>

        <div className="ish-email-actions sticky bottom-0 z-10 flex min-w-0 flex-wrap items-center justify-end gap-2 border-t border-brand-border/50 bg-white/95 px-3 py-2 backdrop-blur-sm lg:static lg:mt-2 lg:border-0 lg:bg-transparent lg:px-0 lg:py-0">
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
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[11px] text-brand-ink-faint">
                    This is Email {draft.sequencePosition}. Send Email 1 to start. Follow-ups go out on schedule.
                  </p>
                  {onOpenFirstEmail ? (
                    <button
                      type="button"
                      onClick={onOpenFirstEmail}
                      className="inline-flex items-center gap-1.5 rounded-full bg-brand-black px-4 py-2 text-[12px] font-semibold text-white shadow-[var(--shadow-brand-sm)] hover:opacity-90"
                    >
                      <Send className="size-3.5" />
                      Go to Email 1
                    </button>
                  ) : null}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleSendToOutreach()}
                  disabled={sending || saving || outreachPaused}
                  className="inline-flex items-center gap-2 rounded-full bg-brand-black px-4 py-2 text-[12px] font-semibold text-white shadow-[var(--shadow-brand-sm)] transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {sending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                  {sending ? "Sending…" : isFollowUpReview ? "Send follow-up" : isReplyDraft ? "Send Reply" : "Send & start sequence"}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

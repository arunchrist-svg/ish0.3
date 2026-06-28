"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Loader2, Mail, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EmailThread, WriterDraft } from "@/lib/api-client";
import { approveOutreach, sendOutreach, updateOutreachDraft, SenderPreflightApiError } from "@/lib/api-client";
import { SegmentedTabs } from "@/design-system";
import { text } from "@/design-system/tokens";
import { toast } from "sonner";
import { EmailEditChat } from "./email-edit-chat";

type Props = {
  draft: WriterDraft;
  leadId: string;
  leadStatus: string;
  contactName?: string;
  companyName?: string;
  contactEmail?: string;
  onDraftUpdated: (draft: WriterDraft) => void;
  onSavingChange?: (saving: boolean) => void;
  onSent?: () => void;
  contentScore?: number;
  emailThread?: EmailThread;
};

function useDebouncedSave(
  saveFn: (payload: { emailBody?: string; subjectA?: string; subjectB?: string }) => void,
  delay = 600,
) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  return useCallback(
    (payload: { emailBody?: string; subjectA?: string; subjectB?: string }) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => saveFn(payload), delay);
    },
    [saveFn, delay],
  );
}

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

function EnvelopeRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[52px_1fr] items-center gap-2 border-b border-ish-border/30 py-2 last:border-b-0">
      <span className={cn(text.label, "text-[10px]")}>{label}</span>
      <div className="min-w-0">{children}</div>
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
  onDraftUpdated,
  onSavingChange,
  onSent,
  contentScore,
  emailThread,
}: Props) {
  const [subjectUsed, setSubjectUsed] = useState<"A" | "B">("A");
  const [displayDraft, setDisplayDraft] = useState(draft);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [fromLabel, setFromLabel] = useState<string | null>(null);
  const bodyText = displayDraft.emailBody ?? "";
  const { ref: bodyRef, resize: resizeBody } = useAutoGrowTextarea(bodyText);

  const isReplyDraft = draft.templateVariant === "reply" || draft.promptVersion?.includes("reply");
  const canSend = isReplyDraft || !draft.sequencePosition || draft.sequencePosition === 1;
  const isDraftLocked =
    ["outreached", "meeting", "po_closed", "tasting_sent", "negotiate", "closed"].includes(leadStatus) ||
    (isReplyDraft && draft.replySent);

  useEffect(() => {
    setDisplayDraft(draft);
  }, [draft]);

  useEffect(() => {
    onSavingChange?.(saving);
  }, [saving, onSavingChange]);

  useEffect(() => {
    let cancelled = false;
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
    async (payload: { emailBody?: string; subjectA?: string; subjectB?: string }) => {
      setSaving(true);
      try {
        const updated = await updateOutreachDraft({
          leadOutreachId: draft.id,
          ...payload,
        });
        const next = {
          ...displayDraft,
          subjectA: updated.subjectA ?? displayDraft.subjectA,
          subjectB: updated.subjectB ?? displayDraft.subjectB,
          emailBody: updated.emailBody ?? displayDraft.emailBody,
        };
        setDisplayDraft(next);
        onDraftUpdated(next);
      } catch {
        // silent
      } finally {
        setSaving(false);
      }
    },
    [draft.id, displayDraft, onDraftUpdated],
  );

  const debouncedSave = useDebouncedSave(persistDraft);

  function handleDraftUpdated(updated: WriterDraft) {
    setDisplayDraft(updated);
    onDraftUpdated(updated);
  }

  const activeSubject = subjectUsed === "A" ? displayDraft.subjectA : displayDraft.subjectB;
  const threadSubject = emailThread?.threadRootSubject;
  const showReRow = Boolean(isReplyDraft && threadSubject);
  const toLine = [contactName, companyName].filter(Boolean).join(" · ");
  const toDetail = contactEmail?.trim() ? `${toLine || "Contact"} · ${contactEmail.trim()}` : toLine || "Add contact email";

  function handleSubjectChange(value: string) {
    const key = subjectUsed === "A" ? "subjectA" : "subjectB";
    const next = { ...displayDraft, [key]: value };
    setDisplayDraft(next);
    debouncedSave({ [key]: value });
  }

  function handleBodyChange(value: string) {
    const next = { ...displayDraft, emailBody: value };
    setDisplayDraft(next);
    debouncedSave({ emailBody: value });
    requestAnimationFrame(resizeBody);
  }

  async function handleSendToOutreach() {
    if (!contactEmail?.trim()) {
      toast.error("Add a contact email before sending");
      return;
    }
    const subjectToSend = isReplyDraft && threadSubject ? threadSubject : activeSubject;
    if (!subjectToSend?.trim() || !bodyText.trim()) {
      toast.error("Subject and body are required");
      return;
    }

    setSending(true);
    try {
      if (saving) await new Promise((r) => setTimeout(r, 700));

      const { approvalId } = await approveOutreach({
        leadOutreachId: displayDraft.id,
        leadId,
        channel: "email",
        status: "approved",
        subjectUsed: subjectToSend,
      });

      let result;
      try {
        result = await sendOutreach(approvalId);
      } catch (e) {
        if (e instanceof SenderPreflightApiError && e.canOverride) {
          const proceed = window.confirm(
            `${e.issues.map((i) => i.label).join("\n")}\n\nSend anyway?`,
          );
          if (!proceed) return;
          result = await sendOutreach(approvalId, { overridePreflight: true });
        } else {
          throw e;
        }
      }
      const recipient = result.to ?? contactEmail;
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
      toast.error(e instanceof Error ? e.message : "Could not send email");
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      id="approval-card"
      className="ish-record-card overflow-hidden rounded-[20px] border border-ish-border/60 bg-white shadow-[var(--shadow-ish-sm)]"
    >
      <div className="flex flex-col p-4 sm:p-5">
        {isReplyDraft && !isDraftLocked && emailThread?.inboundSnippet && (
          <div className="mb-3 rounded-[14px] border border-ish-stratus-blue/22 bg-ish-green-soft px-3.5 py-2.5">
            <div className="mb-1 text-[9px] font-bold uppercase tracking-widest text-ish-stratus-blue">They said</div>
            <p className="text-[11px] leading-relaxed text-ish-ink-soft">{emailThread.inboundSnippet}</p>
          </div>
        )}

        <div className="rounded-[14px] border border-ish-stratus-blue/15 bg-ish-canvas/25 px-3.5 py-1">
          <div className="flex min-w-0 items-center gap-4 border-b border-ish-border/30 py-2">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <span className={cn(text.label, "w-[52px] shrink-0 text-[10px]")}>To</span>
              <p className="min-w-0 truncate text-[12px] font-medium text-ish-ink">{toDetail}</p>
            </div>
            {fromLabel ? (
              <div className="flex min-w-0 flex-1 items-center gap-2 border-l border-ish-border/30 pl-4">
                <span className={cn(text.label, "w-[52px] shrink-0 text-[10px]")}>From</span>
                <p className="min-w-0 truncate text-[12px] text-ish-ink-soft">{fromLabel}</p>
              </div>
            ) : null}
          </div>
          {showReRow ? (
            <EnvelopeRow label="Re">
              <p className="truncate text-[12px] font-semibold text-ish-stratus-blue">{threadSubject}</p>
            </EnvelopeRow>
          ) : null}
          <EnvelopeRow label="Subject">
            <div className="flex min-w-0 items-center gap-2">
              {!showReRow && (
                <SegmentedTabs
                  value={subjectUsed}
                  onChange={(v) => setSubjectUsed(v as "A" | "B")}
                  items={[
                    { value: "A", label: "A" },
                    { value: "B", label: "B" },
                  ]}
                  className="shrink-0"
                />
              )}
              <input
                type="text"
                value={showReRow && threadSubject ? threadSubject : (activeSubject ?? "")}
                onChange={(e) => handleSubjectChange(e.target.value)}
                placeholder="Subject line"
                disabled={isDraftLocked || (showReRow && Boolean(threadSubject))}
                className={cn(
                  "min-w-0 flex-1 rounded-[10px] border border-ish-border/40 bg-white px-3 py-1.5",
                  text.body,
                  "text-[12px] placeholder:text-ish-ink-faint",
                  "focus:border-ish-stratus-blue/40 focus:outline-none focus:ring-2 focus:ring-ish-stratus-blue/12 disabled:opacity-60",
                )}
              />
            </div>
          </EnvelopeRow>
        </div>

        <div className="relative mt-3 rounded-[16px] border border-ish-border/50 bg-white shadow-[var(--shadow-ish-sm)]">
          <textarea
            ref={bodyRef}
            value={bodyText}
            onChange={(e) => handleBodyChange(e.target.value)}
            placeholder="Write your message…"
            rows={1}
            disabled={isDraftLocked}
            className={cn(
              "block w-full resize-none overflow-hidden rounded-[16px] border-0 bg-transparent px-4 py-4 sm:px-5",
              text.body,
              "min-h-[5.5rem] leading-[1.7] placeholder:text-ish-ink-faint focus:outline-none focus:ring-0 disabled:opacity-60",
            )}
          />
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
          <div className="pointer-events-none absolute right-3 top-2 text-[9px] text-ish-ink-faint/80">
            {displayDraft.draftSource} · {displayDraft.revisionCount ?? 0} rev
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
          {saving ? <span className="text-[10px] text-ish-ink-faint">Saving…</span> : null}
          {isDraftLocked ? (
            <Link
              href="/email?tab=active"
              className="inline-flex items-center gap-2 rounded-full bg-ish-black px-4 py-2 text-[12px] font-semibold text-white shadow-[var(--shadow-ish-sm)] transition-opacity hover:opacity-90"
            >
              <Mail className="size-3.5" />
              View in Outreach Queue
            </Link>
          ) : !canSend ? (
            <p className="text-[11px] text-ish-ink-faint">Edits save automatically · sends on schedule</p>
          ) : (
            <button
              type="button"
              onClick={() => void handleSendToOutreach()}
              disabled={sending || saving}
              className="inline-flex items-center gap-2 rounded-full bg-ish-black px-4 py-2 text-[12px] font-semibold text-white shadow-[var(--shadow-ish-sm)] transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {sending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
              {sending ? "Sending…" : isReplyDraft ? "Send Reply" : "Send & start sequence"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

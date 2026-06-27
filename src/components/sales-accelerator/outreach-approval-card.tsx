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

export function OutreachApprovalCard({
  draft,
  leadId,
  leadStatus,
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
        // silent — user can retry by editing again
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
      toast.error("Add a contact email before sending to outreach");
      return;
    }
    const subjectToSend =
      isReplyDraft && emailThread?.threadRootSubject ? emailThread.threadRootSubject : activeSubject;
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
        result.mode === "dry_run"
          ? "logged (dry run — not sent)"
          : `sent to ${recipient}`;
      toast.success(`Email ${modeLabel}`, {
        action: {
          label: "Open Email",
          onClick: () => window.location.assign("/email"),
        },
      });
      onSent?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send to outreach");
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      id="approval-card"
      className="ish-record-card overflow-hidden rounded-[20px] border border-ish-border/60 bg-white shadow-[var(--shadow-ish-sm)]"
    >
      <div className="flex flex-col gap-3 p-4 sm:p-5">
        {isReplyDraft && !isDraftLocked && emailThread?.inboundSnippet && (
          <div className="rounded-[14px] border border-ish-stratus-blue/22 bg-ish-green-soft px-3.5 py-2.5">
            <div className="mb-1 text-[9px] font-bold uppercase tracking-widest text-ish-stratus-blue">They said</div>
            <p className="text-[11px] leading-relaxed text-ish-ink-soft">{emailThread.inboundSnippet}</p>
          </div>
        )}
        {isReplyDraft && !isDraftLocked && (
          <div className="rounded-[14px] border border-ish-stratus-blue/25 bg-ish-green-soft/50 px-3.5 py-2.5 text-[11px] leading-relaxed text-ish-ink-soft">
            <span className="font-bold text-ish-ink">Replying in thread.</span>{" "}
            {emailThread?.threadRootSubject
              ? `Subject will be sent as "${emailThread.threadRootSubject}".`
              : "This sends as a reply in their existing email thread."}
          </div>
        )}
        <div className="flex flex-col gap-2 rounded-[14px] border border-ish-stratus-blue/18 bg-white/70 px-3 py-2.5 shadow-[var(--shadow-ish-sm)] backdrop-blur-sm sm:flex-row sm:items-center sm:gap-3">
          <span className={cn(text.label, "shrink-0")}>Subject</span>
          <SegmentedTabs
            value={subjectUsed}
            onChange={(v) => setSubjectUsed(v as "A" | "B")}
            items={[
              { value: "A", label: "A" },
              { value: "B", label: "B" },
            ]}
            className="shrink-0"
          />
          <input
            type="text"
            value={isReplyDraft && emailThread?.threadRootSubject ? emailThread.threadRootSubject : (activeSubject ?? "")}
            onChange={(e) => handleSubjectChange(e.target.value)}
            placeholder="Subject line"
            disabled={isDraftLocked || (isReplyDraft && Boolean(emailThread?.threadRootSubject))}
            className={cn(
              "min-w-0 flex-1 rounded-[10px] border border-ish-border/40 bg-ish-canvas/60 px-3 py-1.5",
              text.body,
              "placeholder:text-ish-ink-faint",
              "focus:border-ish-stratus-blue/40 focus:outline-none focus:ring-2 focus:ring-ish-stratus-blue/12 disabled:opacity-60",
            )}
          />
        </div>

        <div className="rounded-[16px] border border-ish-border/50 bg-white shadow-[var(--shadow-ish-sm)]">
          <div className="flex items-center justify-between border-b border-ish-stratus-yellow/30 bg-ish-yellow-soft/60 px-4 py-2">
            <div className={text.label}>Email body</div>
            <div className="text-[10px] text-ish-ink-faint">
              {displayDraft.draftSource} · {displayDraft.promptVersion} · {displayDraft.revisionCount ?? 0} rev
            </div>
          </div>
          <textarea
            ref={bodyRef}
            value={bodyText}
            onChange={(e) => handleBodyChange(e.target.value)}
            placeholder="Email body…"
            rows={1}
            disabled={isDraftLocked}
            className={cn(
              "block w-full resize-none overflow-hidden border-0 bg-transparent px-4 py-4 sm:px-5",
              text.body,
              "min-h-[4.5rem] leading-[1.7] placeholder:text-ish-ink-faint focus:outline-none focus:ring-0 disabled:opacity-60",
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
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
          {isDraftLocked ? (
            <Link
              href="/email"
              className="inline-flex items-center gap-2 rounded-full bg-ish-black px-4 py-2 text-[12px] font-semibold text-white shadow-[var(--shadow-ish-sm)] transition-opacity hover:opacity-90"
            >
              <Mail className="size-3.5" />
              View in Email Outreach
            </Link>
          ) : !canSend ? (
            <p className="text-[11px] text-ish-ink-faint">This follow-up sends automatically on schedule.</p>
          ) : (
            <div className="flex flex-col items-end gap-1">
              <button
                type="button"
                onClick={() => void handleSendToOutreach()}
                disabled={sending || saving}
                className="inline-flex items-center gap-2 rounded-full bg-ish-black px-4 py-2 text-[12px] font-semibold text-white shadow-[var(--shadow-ish-sm)] transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {sending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                {sending ? "Sending…" : isReplyDraft ? "Send Reply" : "Send to Email Outreach"}
              </button>
              {contactEmail?.trim() && (
                <p className="text-[10px] text-ish-ink-faint">
                  {isReplyDraft ? "Replies in thread to" : "Sends to"} {contactEmail.trim()}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

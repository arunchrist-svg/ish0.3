"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mail } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WriterDraft } from "@/lib/api-client";
import { updateOutreachDraft } from "@/lib/api-client";
import { SegmentedTabs } from "@/design-system";
import { text } from "@/design-system/tokens";
import { EmailEditChat } from "./email-edit-chat";

type Props = {
  draft: WriterDraft;
  contactName?: string;
  companyName?: string;
  onDraftUpdated: (draft: WriterDraft) => void;
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

export function OutreachApprovalCard({ draft, contactName, companyName, onDraftUpdated }: Props) {
  const [subjectUsed, setSubjectUsed] = useState<"A" | "B">("A");
  const [displayDraft, setDisplayDraft] = useState(draft);
  const [saving, setSaving] = useState(false);
  const bodyText = displayDraft.emailBody ?? "";
  const { ref: bodyRef, resize: resizeBody } = useAutoGrowTextarea(bodyText);

  useEffect(() => {
    setDisplayDraft(draft);
  }, [draft.id, draft.revisionCount, draft.subjectA, draft.subjectB, draft.emailBody, draft.rubricTotal]);

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

  return (
    <div
      id="approval-card"
      className="rounded-[20px] border border-ish-border bg-white shadow-[var(--shadow-ish-sm)]"
    >
      <div className="flex items-center gap-2.5 bg-ish-yellow-gradient px-4 py-3">
        <div className="flex size-8 items-center justify-center rounded-full bg-ish-black text-white shadow-[var(--shadow-ish-sm)]">
          <Mail className="size-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className={cn(text.label, "text-ish-ink/55")}>Draft preview</div>
          <div className={cn(text.caption, "truncate text-ish-ink-soft")}>
            To: <span className="font-semibold text-ish-ink">{contactName ?? "Contact"}</span>
            {companyName ? ` · ${companyName}` : ""}
          </div>
        </div>
        {saving && <span className={cn(text.caption, "text-ish-ink-faint")}>Saving…</span>}
      </div>

      <div className="flex flex-col gap-3 bg-ish-app/50 p-4 sm:p-5">
        <div className="flex flex-col gap-2 rounded-[14px] border border-ish-border/50 bg-white/80 px-3 py-2.5 shadow-[var(--shadow-ish-sm)] sm:flex-row sm:items-center sm:gap-3">
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
            value={activeSubject ?? ""}
            onChange={(e) => handleSubjectChange(e.target.value)}
            placeholder="Subject line"
            className={cn(
              "min-w-0 flex-1 rounded-[10px] border border-ish-border/40 bg-ish-canvas/60 px-3 py-1.5",
              text.body,
              "placeholder:text-ish-ink-faint",
              "focus:border-ish-stratus-blue/40 focus:outline-none focus:ring-2 focus:ring-ish-stratus-blue/12",
            )}
          />
        </div>

        <div className="rounded-[16px] border border-ish-border/50 bg-white shadow-[var(--shadow-ish-sm)]">
          <div className="border-b border-ish-border/60 bg-ish-yellow-soft/40 px-4 py-2">
            <div className={text.label}>Email body</div>
          </div>
          <textarea
            ref={bodyRef}
            value={bodyText}
            onChange={(e) => handleBodyChange(e.target.value)}
            placeholder="Email body…"
            rows={1}
            className={cn(
              "block w-full resize-none overflow-hidden border-0 bg-transparent px-4 py-4 sm:px-5",
              text.body,
              "min-h-[4.5rem] leading-[1.7] placeholder:text-ish-ink-faint focus:outline-none focus:ring-0",
            )}
          />
          <EmailEditChat
            embedded
            leadOutreachId={displayDraft.id}
            messages={displayDraft.editMessages ?? []}
            onDraftUpdated={(updated, messages) =>
              handleDraftUpdated({ ...updated, editMessages: messages })
            }
          />
        </div>
      </div>
    </div>
  );
}

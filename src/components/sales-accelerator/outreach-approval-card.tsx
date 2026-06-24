"use client";

import { useEffect, useState } from "react";
import { Check, Mail } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WriterDraft } from "@/lib/api-client";
import { EmailEditChat } from "./email-edit-chat";

type Props = {
  draft: WriterDraft;
  contactName?: string;
  companyName?: string;
  onDraftUpdated: (draft: WriterDraft) => void;
};

export function OutreachApprovalCard({ draft, contactName, companyName, onDraftUpdated }: Props) {
  const [subjectUsed, setSubjectUsed] = useState<"A" | "B">("A");
  const [displayDraft, setDisplayDraft] = useState(draft);

  useEffect(() => {
    setDisplayDraft(draft);
  }, [draft.id, draft.revisionCount, draft.subjectA, draft.subjectB, draft.emailBody, draft.rubricTotal]);

  function handleDraftUpdated(updated: WriterDraft) {
    setDisplayDraft(updated);
    onDraftUpdated(updated);
  }

  const activeSubject = subjectUsed === "A" ? displayDraft.subjectA : displayDraft.subjectB;

  return (
    <div
      id="approval-card"
      className="overflow-hidden rounded-[20px] border border-ish-border bg-white shadow-[var(--shadow-ish-sm)]"
    >
      <div className="grid min-h-[520px] lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-h-0 flex-col border-b border-ish-border lg:border-b-0 lg:border-r">
          <div className="flex items-center gap-2 border-b border-ish-border bg-ish-canvas/60 px-4 py-2.5">
            <div className="flex size-7 items-center justify-center rounded-full bg-white shadow-[var(--shadow-ish-sm)]">
              <Mail className="size-3.5 text-ish-ink-soft" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-bold uppercase tracking-widest text-ish-ink-faint">Draft preview</div>
              <div className="truncate text-[12px] text-ish-ink-soft">
                To: <span className="font-semibold text-ish-ink">{contactName ?? "Contact"}</span>
                {companyName ? ` · ${companyName}` : ""}
              </div>
            </div>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
            <div>
              <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-ish-ink-faint">
                Subject line
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {(["A", "B"] as const).map((v) => {
                  const text = v === "A" ? displayDraft.subjectA : displayDraft.subjectB;
                  const selected = subjectUsed === v;
                  return (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setSubjectUsed(v)}
                      className={cn(
                        "group relative rounded-[14px] border p-3 text-left transition-all",
                        selected
                          ? "border-ish-black bg-ish-black text-white shadow-[var(--shadow-ish-sm)]"
                          : "border-ish-border bg-white text-ish-ink hover:border-ish-ink/20 hover:bg-ish-canvas/80",
                      )}
                    >
                      <div className="mb-1.5 flex items-center justify-between gap-2">
                        <span
                          className={cn(
                            "text-[10px] font-bold uppercase tracking-wide",
                            selected ? "text-white/60" : "text-ish-ink-faint",
                          )}
                        >
                          Option {v}
                        </span>
                        {selected && (
                          <span className="flex size-4 items-center justify-center rounded-full bg-ish-yellow text-ish-ink">
                            <Check className="size-2.5" strokeWidth={3} />
                          </span>
                        )}
                      </div>
                      <p className="text-[12.5px] leading-snug">{text ?? "—"}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-[16px] border border-ish-border bg-ish-canvas/40">
              <div className="border-b border-ish-border/80 px-4 py-2.5">
                <div className="text-[10px] font-bold uppercase tracking-widest text-ish-ink-faint">Email body</div>
                {activeSubject && (
                  <div className="mt-1 truncate text-[11px] text-ish-ink-soft">
                    Subject: <span className="font-medium text-ish-ink">{activeSubject}</span>
                  </div>
                )}
              </div>
              <div className="px-4 py-4 sm:px-5 sm:py-5">
                <pre className="whitespace-pre-wrap font-sans text-[13px] leading-[1.7] text-ish-ink">
                  {displayDraft.emailBody ?? "(No body generated)"}
                </pre>
              </div>
            </div>
          </div>
        </div>

        <div className="flex min-h-[320px] flex-col bg-gradient-to-b from-ish-yellow-soft/40 to-white lg:min-h-0">
          <EmailEditChat
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

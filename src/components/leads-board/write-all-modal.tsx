"use client";

import { Check } from "lucide-react";
import { AppModal } from "@/components/ui/app-modal";
import { WritingLoader } from "@/components/sales-accelerator/writing-loader";
import { cn } from "@/lib/utils";
import { isZeroCostTemplateWrite } from "@/lib/email/outreach-templates";
import { getCreditCost } from "@/lib/billing/credit-costs";
import type { BoardBulkProgress } from "./board-bulk-actions";

export type WriteAllTemplateOption = {
  id: string;
  label: string;
  shortLabel: string;
  description?: string;
};

export type WriteAllPhase = "pick" | "writing" | "done";

type Props = {
  open: boolean;
  mode: "write" | "rewrite";
  templates: WriteAllTemplateOption[];
  selectedTemplateId: string | null;
  onSelectTemplate: (id: string) => void;
  leadCount: number;
  phase: WriteAllPhase;
  progress: BoardBulkProgress | null;
  result?: { ok: number; failed: number; cancelled: number } | null;
  onWrite: () => void;
  onCancelWrite: () => void;
  onClose: () => void;
};

export function WriteAllModal({
  open,
  mode,
  templates,
  selectedTemplateId,
  onSelectTemplate,
  leadCount,
  phase,
  progress,
  result,
  onWrite,
  onCancelWrite,
  onClose,
}: Props) {
  const writing = phase === "writing";
  const title = mode === "rewrite" ? "Rewrite all emails" : "Write all emails";
  const verb = mode === "rewrite" ? "Rewrite" : "Write";
  const selected = templates.find((t) => t.id === selectedTemplateId);
  const freeTemplate = isZeroCostTemplateWrite(selectedTemplateId);
  const creditsPer = freeTemplate ? 0 : getCreditCost("writer.draft") * 3;
  const creditsEstimate = leadCount * creditsPer;

  return (
    <AppModal open={open} onClose={writing ? undefined : onClose} panelClassName="lg:max-w-lg">
      <div className="pr-8">
        <h2 className="text-[17px] font-bold tracking-tight text-brand-ink">{title}</h2>
        <p className="mt-1 text-[13px] text-brand-ink-soft">
          {leadCount === 1
            ? `1 lead in ${mode === "rewrite" ? "Email" : "Contact Ready"}`
            : `${leadCount.toLocaleString()} leads in ${mode === "rewrite" ? "Email" : "Contact Ready"}`}
        </p>
      </div>

      {phase === "pick" ? (
        <>
          <p className="mt-5 text-[11px] font-semibold uppercase tracking-wide text-brand-ink-faint">
            Template
          </p>
          <ul className="mt-2 max-h-[min(42vh,320px)] space-y-1.5 overflow-y-auto pr-0.5">
            {templates.map((template) => {
              const isSelected = selectedTemplateId === template.id;
              return (
                <li key={template.id}>
                  <button
                    type="button"
                    onClick={() => onSelectTemplate(template.id)}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-2xl border px-3.5 py-2.5 text-left transition-colors",
                      isSelected
                        ? "border-brand-stratus-blue/40 bg-brand-stratus-blue/8"
                        : "border-brand-border/70 bg-white hover:border-brand-ink/20",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border",
                        isSelected
                          ? "border-brand-stratus-blue bg-brand-stratus-blue text-white"
                          : "border-brand-border text-transparent",
                      )}
                      aria-hidden
                    >
                      <Check className="size-3" strokeWidth={3} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "block text-[13px] font-semibold",
                          isSelected ? "text-brand-stratus-blue" : "text-brand-ink",
                        )}
                      >
                        {template.label}
                      </span>
                      {template.description ? (
                        <span className="mt-0.5 block text-[12px] leading-snug text-brand-ink-soft">
                          {template.description}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <p className="mt-4 text-[12px] text-brand-ink-soft">
            {freeTemplate
              ? "Prasant Template uses fixed copy (no AI credits)."
              : `About ${creditsEstimate.toLocaleString()} credits for ${leadCount.toLocaleString()} ${
                  leadCount === 1 ? "lead" : "leads"
                }.`}
            {mode === "rewrite" ? " Existing drafts will be replaced." : ""}
          </p>

          <div className="mt-5 flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-full border border-brand-border/70 bg-white px-3 py-2.5 text-[13px] font-semibold text-brand-ink-soft transition-colors hover:border-brand-ink/20 hover:text-brand-ink"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={leadCount === 0 || !selectedTemplateId}
              onClick={onWrite}
              className={cn(
                "flex-1 rounded-full border border-brand-stratus-blue/30 bg-brand-stratus-blue px-3 py-2.5 text-[13px] font-semibold text-white transition-colors",
                "hover:bg-brand-stratus-blue/90",
                "disabled:cursor-not-allowed disabled:opacity-50",
              )}
            >
              {verb} all
            </button>
          </div>
        </>
      ) : null}

      {phase === "writing" ? (
        <div className="mt-2">
          <WritingLoader
            contactName={progress?.leadName}
            sequenceLabel={
              progress && progress.total > 0
                ? `${verb}ing ${progress.current} of ${progress.total}${
                    progress.leadName ? ` · ${progress.leadName}` : ""
                  }`
                : `${verb}ing emails`
            }
          />
          {progress && progress.total > 0 ? (
            <div className="mx-auto mb-2 h-1.5 w-44 overflow-hidden rounded-full bg-brand-border">
              <div
                className="h-full rounded-full bg-brand-stratus-blue transition-[width] duration-300"
                style={{ width: `${Math.min(100, (progress.current / progress.total) * 100)}%` }}
              />
            </div>
          ) : null}
          <p className="px-2 pb-2 text-center text-[12px] text-brand-ink-soft">
            Using {selected?.shortLabel ?? "the selected template"}. Stay on this page until it finishes.
          </p>
          <button
            type="button"
            onClick={onCancelWrite}
            className="mx-auto mt-1 mb-1 block rounded-full border border-red-200 bg-red-50/80 px-4 py-2 text-[12px] font-semibold text-red-700 transition-colors hover:border-red-300"
          >
            Cancel
          </button>
        </div>
      ) : null}

      {phase === "done" ? (
        <div className="mt-6 space-y-4">
          <p className="text-[14px] font-semibold text-brand-ink">
            {result && result.cancelled > 0 && result.ok === 0
              ? "Write cancelled"
              : result && result.failed === 0 && result.cancelled === 0
                ? `Wrote ${result.ok.toLocaleString()} ${result.ok === 1 ? "email" : "emails"}`
                : `Finished: ${result?.ok ?? 0} written${
                    result?.failed ? `, ${result.failed} failed` : ""
                  }${result?.cancelled ? `, ${result.cancelled} cancelled` : ""}`}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-full border border-brand-stratus-blue/30 bg-brand-stratus-blue px-3 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-brand-stratus-blue/90"
          >
            Done
          </button>
        </div>
      ) : null}
    </AppModal>
  );
}

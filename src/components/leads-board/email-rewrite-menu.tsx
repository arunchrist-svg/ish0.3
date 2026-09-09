"use client";

import { useEffect, useRef } from "react";
import { Check, Loader2, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

export type RewriteTemplateOption = {
  id: string;
  shortLabel: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templates: RewriteTemplateOption[];
  selectedTemplateId: string | null;
  onSelectTemplate: (id: string) => void;
  onWrite: () => void;
  busy?: boolean;
  disabled?: boolean;
  empty?: boolean;
};

export function EmailRewriteMenu({
  open,
  onOpenChange,
  templates,
  selectedTemplateId,
  onSelectTemplate,
  onWrite,
  busy,
  disabled,
  empty,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        onOpenChange(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onOpenChange(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onOpenChange]);

  return (
    <div ref={rootRef} className={cn("relative", open && "z-50")}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onOpenChange(!open)}
        className={cn(
          "flex size-6 items-center justify-center rounded-full border border-brand-border/70 bg-white/80 text-brand-ink-soft transition-all",
          "hover:border-brand-ink/25 hover:text-brand-ink",
          "disabled:cursor-not-allowed disabled:opacity-50",
          (open || busy) && "border-brand-stratus-blue/30 text-brand-stratus-blue",
        )}
        aria-label="Rewrite emails"
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Rewrite emails"
      >
        {busy ? <Loader2 className="size-3 animate-spin" /> : <Pencil className="size-3" />}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Rewrite emails"
          className="absolute right-0 top-full z-50 mt-1.5 w-[13.5rem] isolate overflow-hidden rounded-xl border border-brand-border/70 bg-[#ffffff] shadow-[var(--shadow-brand-sm)]"
        >
          <div className="border-b border-brand-border/50 bg-[#ffffff] px-3 py-2.5 pr-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-ink-faint">
              Choose template
            </p>
          </div>
          <ul className="max-h-44 space-y-0.5 overflow-y-auto bg-[#ffffff] p-1.5">
            {templates.map((template) => {
              const selected = selectedTemplateId === template.id;
              return (
                <li key={template.id}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onSelectTemplate(template.id)}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12px] transition-colors",
                      selected
                        ? "bg-brand-stratus-blue/10 font-semibold text-brand-stratus-blue"
                        : "text-brand-ink hover:bg-brand-app",
                      "disabled:opacity-50",
                    )}
                  >
                    <span className="truncate">{template.shortLabel}</span>
                    {selected ? <Check className="size-3 shrink-0" strokeWidth={2.5} /> : null}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="flex items-center gap-1.5 border-t border-brand-border/50 bg-[#ffffff] p-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="flex-1 rounded-full border border-brand-border/70 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-brand-ink-soft transition-colors hover:border-brand-ink/20 hover:text-brand-ink"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy || empty || !selectedTemplateId}
              onClick={() => {
                onOpenChange(false);
                onWrite();
              }}
              className={cn(
                "flex-1 rounded-full border border-brand-stratus-blue/30 bg-brand-stratus-blue/10 px-2.5 py-1.5 text-[11px] font-semibold text-brand-stratus-blue transition-colors",
                "hover:bg-brand-stratus-blue/15",
                "disabled:cursor-not-allowed disabled:opacity-50",
              )}
            >
              Write
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

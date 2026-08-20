"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { LinkedInGlyph } from "@/components/icons/linkedin-glyph";
import { Button } from "@/design-system";
import { AppModal } from "@/components/ui/app-modal";
import { cn } from "@/lib/utils";
import {
  createLeadFromLinkedIn,
  LinkedInLeadIncompleteError,
  type LinkedInLeadPartialProfile,
} from "@/lib/api-client";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: (leadId: string, existing: boolean) => void | Promise<void>;
  onIncomplete?: (partial: LinkedInLeadPartialProfile) => void;
};

const labelClass = "mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-brand-ink";
const fieldClass = cn(
  "ish-modal-field w-full rounded-[14px] border border-brand-border/70 px-3.5 py-2.5 text-[13px] font-medium text-brand-ink",
  "placeholder:text-brand-ink-faint outline-none shadow-[var(--shadow-brand-sm)] focus:border-brand-stratus-blue/40 focus:ring-2 focus:ring-brand-stratus-blue/12",
);

export function LinkedInLeadModal({ open, onClose, onCreated, onIncomplete }: Props) {
  const [linkedInUrl, setLinkedInUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setLinkedInUrl("");
    setError("");
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const url = linkedInUrl.trim();
    if (!url) {
      setError("Paste a LinkedIn profile URL");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const result = await createLeadFromLinkedIn({ linkedInUrl: url });
      await onCreated(result.id, result.existing === true);
      onClose();
    } catch (err) {
      if (err instanceof LinkedInLeadIncompleteError) {
        onIncomplete?.(err.partial);
        onClose();
        return;
      }
      setError(err instanceof Error ? err.message : "Could not add lead from LinkedIn");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppModal open={open} onClose={onClose} panelClassName="max-h-[90vh] overflow-y-auto">
      <div className="flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-xl bg-[#0A66C2]/10 text-[#0A66C2]">
          <LinkedInGlyph className="size-4" />
        </span>
        <div>
          <h3 className="text-[16px] font-bold text-brand-ink">Add from LinkedIn</h3>
          <p className="mt-0.5 text-[13px] leading-relaxed text-brand-ink-soft">
            Paste a profile link. We pull name, title, company, and contact details.
          </p>
        </div>
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} className="mt-4 space-y-3.5">
        <div>
          <label className={labelClass} htmlFor="linkedin-url">
            LinkedIn profile URL
          </label>
          <input
            id="linkedin-url"
            className={fieldClass}
            value={linkedInUrl}
            onChange={(e) => setLinkedInUrl(e.target.value)}
            placeholder="https://linkedin.com/in/jane-doe"
            autoComplete="url"
            autoFocus
            disabled={submitting}
          />
        </div>

        {error ? <p className="text-[12px] font-medium text-red-600">{error}</p> : null}

        <div className="flex justify-end gap-2 border-t border-brand-border/60 pt-4">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ish-modal-cancel h-auto rounded-[14px] border border-brand-border px-4 py-2 text-[12px] font-semibold text-brand-ink shadow-[var(--shadow-brand-sm)] hover:border-brand-stratus-blue/30 hover:bg-brand-canvas"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            disabled={submitting}
            className="h-auto rounded-[14px] bg-brand-black px-4 py-2 text-[12px] font-semibold text-white shadow-[var(--shadow-brand-sm)] hover:bg-brand-black/90 disabled:opacity-40"
          >
            {submitting ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="size-3.5 animate-spin" />
                Importing…
              </span>
            ) : (
              "Add lead"
            )}
          </Button>
        </div>
      </form>
    </AppModal>
  );
}

"use client";

import { useEffect, useState } from "react";
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

const FETCH_HINTS = [
  "Opening the profile",
  "Reading name and title",
  "Finding company",
  "Looking up contact details",
];

function LinkedInFetchLoader() {
  const [hintIndex, setHintIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setHintIndex((i) => (i + 1) % FETCH_HINTS.length);
    }, 1800);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      className="flex flex-col items-center justify-center px-4 py-8"
      role="status"
      aria-live="polite"
      aria-label="Fetching LinkedIn profile"
    >
      <div className="relative mb-5 flex size-[72px] items-center justify-center">
        <span className="absolute inset-0 rounded-full border border-brand-stratus-blue/35 animate-brand-radar" />
        <span className="absolute inset-1 rounded-full border border-brand-stratus-blue/20 animate-brand-radar [animation-delay:0.6s]" />
        <span className="absolute inset-2 rounded-full border border-brand-stratus-yellow/25 animate-brand-radar [animation-delay:1.2s]" />
        <div className="relative z-10 flex size-11 items-center justify-center rounded-2xl bg-brand-stratus-blue text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.28),0_4px_14px_rgba(var(--brand-stratus-blue-rgb),0.36)]">
          <LinkedInGlyph className="size-5" />
        </div>
        <span className="absolute inset-0 animate-brand-orbit">
          <span className="absolute left-1/2 top-0 size-1.5 -translate-x-1/2 rounded-full bg-brand-stratus-yellow shadow-[0_0_6px_rgba(var(--brand-stratus-yellow-rgb),0.7)]" />
        </span>
      </div>
      <p className="text-[15px] font-semibold tracking-tight text-brand-ink">
        Fetching profile
        <span className="inline-flex w-[1.1em]">
          <span className="animate-brand-dot [animation-delay:0ms]">.</span>
          <span className="animate-brand-dot [animation-delay:180ms]">.</span>
          <span className="animate-brand-dot [animation-delay:360ms]">.</span>
        </span>
      </p>
      <div className="mt-4 h-1 w-44 overflow-hidden rounded-full bg-brand-border">
        <div className="h-full w-2/5 rounded-full bg-brand-stratus-blue animate-brand-shimmer-bar" />
      </div>
      <p key={hintIndex} className="mt-3 text-center text-[12px] text-brand-ink-faint animate-d365-in">
        {FETCH_HINTS[hintIndex]}
      </p>
    </div>
  );
}

export function LinkedInLeadModal({ open, onClose, onCreated, onIncomplete }: Props) {
  const [linkedInUrl, setLinkedInUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setLinkedInUrl("");
    setError("");
    setSubmitting(false);
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
    <AppModal open={open} onClose={submitting ? undefined : onClose} panelClassName="max-h-[90vh] overflow-y-auto">
      {submitting ? (
        <LinkedInFetchLoader />
      ) : (
        <>
          <div className="relative -mx-6 -mt-2 mb-1 overflow-hidden rounded-t-[18px] px-6 pb-4 pt-3 lg:-mt-6 lg:pt-5">
            <div
              className="pointer-events-none absolute inset-0 [background:radial-gradient(ellipse_90%_80%_at_0%_0%,rgba(var(--brand-stratus-yellow-rgb),0.22)_0%,transparent_58%),radial-gradient(ellipse_70%_90%_at_100%_50%,rgba(var(--brand-stratus-blue-rgb),0.14)_0%,transparent_55%)]"
              aria-hidden
            />
            <div className="ish-board-hero-stripe pointer-events-none absolute inset-x-0 top-0" aria-hidden />
            <div className="relative flex items-center gap-2.5">
              <span className="flex size-9 items-center justify-center rounded-xl bg-brand-stratus-blue text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.28),0_4px_12px_rgba(var(--brand-stratus-blue-rgb),0.32)]">
                <LinkedInGlyph className="size-4" />
              </span>
              <h3 className="pr-10 text-[16px] font-bold tracking-tight text-brand-ink">Add from LinkedIn</h3>
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
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="ghost"
                size="sm"
                className="ish-scout-cta-blue h-auto rounded-[14px] px-4 py-2 text-[12px] font-semibold text-white hover:opacity-95 disabled:opacity-40"
              >
                Add lead
              </Button>
            </div>
          </form>
        </>
      )}
    </AppModal>
  );
}

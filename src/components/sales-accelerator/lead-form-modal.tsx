"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/design-system";
import { AppModal } from "@/components/ui/app-modal";
import { cn } from "@/lib/utils";
import type { LeadDetailRecord, LeadFormInput } from "@/lib/api-client";

type Props = {
  open: boolean;
  mode: "create" | "edit";
  initial?: LeadDetailRecord | null;
  createDraft?: LeadFormInput | null;
  onClose: () => void;
  onSubmit: (values: LeadFormInput) => Promise<void>;
};

const labelClass = "mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-brand-ink";
const fieldClass = cn(
  "ish-modal-field w-full rounded-[14px] border border-brand-border/70 px-3.5 py-2.5 text-[13px] font-medium text-brand-ink",
  "placeholder:text-brand-ink-faint outline-none shadow-[var(--shadow-brand-sm)] focus:border-brand-stratus-blue/40 focus:ring-2 focus:ring-brand-stratus-blue/12",
);

export function LeadFormModal({ open, mode, initial, createDraft, onClose, onSubmit }: Props) {
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [linkedIn, setLinkedIn] = useState("");
  const [company, setCompany] = useState("");
  const [city, setCity] = useState("");
  const [score, setScore] = useState("60");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    if (mode === "edit" && initial) {
      setName(initial.name);
      setTitle(initial.title === "—" ? "" : initial.title);
      setEmail(initial.email === "—" ? "" : initial.email);
      setPhone(initial.phone ?? "");
      setLinkedIn(initial.linkedIn ?? "");
      setCompany(initial.company);
      setCity(initial.city === "—" ? "" : initial.city);
      setScore(String(initial.score ?? 60));
    } else {
      setName(createDraft?.name ?? "");
      setTitle(createDraft?.title ?? "");
      setEmail(createDraft?.email ?? "");
      setPhone(createDraft?.phone ?? "");
      setLinkedIn(createDraft?.linkedIn ?? "");
      setCompany(createDraft?.company ?? "");
      setCity(createDraft?.city ?? "");
      setScore(String(createDraft?.score ?? 60));
    }
  }, [open, mode, initial, createDraft]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !company.trim()) {
      setError("Name and company are required");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await onSubmit({
        name: name.trim(),
        title: title.trim() || undefined,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        linkedIn: linkedIn.trim() || undefined,
        company: company.trim(),
        city: city.trim() || undefined,
        score: Number(score) || 60,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppModal open={open} onClose={onClose} panelClassName="max-h-[90vh] overflow-y-auto">
      <h3 className="pr-10 text-[16px] font-bold text-brand-ink">
        {mode === "create" ? "Add lead" : "Edit lead"}
      </h3>

      <form onSubmit={(e) => void handleSubmit(e)} className="mt-4 space-y-3.5">
        <div>
          <label className={labelClass} htmlFor="lead-name">Name</label>
          <input id="lead-name" className={fieldClass} value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
        </div>
        <div>
          <label className={labelClass} htmlFor="lead-title">Title</label>
          <input id="lead-title" className={fieldClass} value={title} onChange={(e) => setTitle(e.target.value)} autoComplete="organization-title" />
        </div>
        <div>
          <label className={labelClass} htmlFor="lead-email">Email</label>
          <input
            id="lead-email"
            type="email"
            name="lead-email"
            className={cn(fieldClass, "pr-3")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            spellCheck={false}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="lead-phone">Phone</label>
          <input id="lead-phone" type="tel" name="lead-phone" className={fieldClass} value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
        </div>
        <div>
          <label className={labelClass} htmlFor="lead-company">Company</label>
          <input id="lead-company" className={fieldClass} value={company} onChange={(e) => setCompany(e.target.value)} required autoComplete="organization" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass} htmlFor="lead-city">City</label>
            <input id="lead-city" className={fieldClass} value={city} onChange={(e) => setCity(e.target.value)} autoComplete="address-level2" />
          </div>
          <div>
            <label className={labelClass} htmlFor="lead-score">Score</label>
            <input id="lead-score" type="number" min={0} max={100} className={fieldClass} value={score} onChange={(e) => setScore(e.target.value)} />
          </div>
        </div>
        <div>
          <label className={labelClass} htmlFor="lead-linkedin">LinkedIn URL</label>
          <input id="lead-linkedin" className={fieldClass} value={linkedIn} onChange={(e) => setLinkedIn(e.target.value)} placeholder="https://linkedin.com/in/..." autoComplete="url" />
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
            className="ish-scout-cta-blue h-auto rounded-[14px] px-4 py-2 text-[12px] font-semibold text-white disabled:opacity-40"
          >
            {submitting ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="size-3.5 animate-spin" />
                Saving…
              </span>
            ) : mode === "create" ? (
              "Add lead"
            ) : (
              "Save changes"
            )}
          </Button>
        </div>
      </form>
    </AppModal>
  );
}

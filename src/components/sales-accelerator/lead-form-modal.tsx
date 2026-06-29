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
  onClose: () => void;
  onSubmit: (values: LeadFormInput) => Promise<void>;
};

const labelClass = "mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-ish-ink";
const fieldClass = cn(
  "ish-modal-field w-full rounded-[14px] border border-ish-border/70 px-3.5 py-2.5 text-[13px] font-medium text-ish-ink",
  "placeholder:text-ish-ink-faint outline-none shadow-[var(--shadow-ish-sm)] focus:border-ish-stratus-blue/40 focus:ring-2 focus:ring-ish-stratus-blue/12",
);

export function LeadFormModal({ open, mode, initial, onClose, onSubmit }: Props) {
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
      setName("");
      setTitle("");
      setEmail("");
      setPhone("");
      setLinkedIn("");
      setCompany("");
      setCity("");
      setScore("60");
    }
  }, [open, mode, initial]);

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
      <h3 className="text-[16px] font-bold text-ish-ink">
        {mode === "create" ? "Add lead" : "Edit lead"}
      </h3>
      <p className="mt-1.5 text-[13px] leading-relaxed text-ish-ink-soft">
        {mode === "create"
          ? "Create a lead manually with contact and company details."
          : "Update contact and company details for this lead."}
      </p>

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

        <div className="flex justify-end gap-2 border-t border-ish-border/60 pt-4">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ish-modal-cancel h-auto rounded-[14px] border border-ish-border px-4 py-2 text-[12px] font-semibold text-ish-ink shadow-[var(--shadow-ish-sm)] hover:border-ish-stratus-blue/30 hover:bg-ish-canvas"
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
            className="h-auto rounded-[14px] bg-ish-black px-4 py-2 text-[12px] font-semibold text-white shadow-[var(--shadow-ish-sm)] hover:bg-ish-black/90 disabled:opacity-40"
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

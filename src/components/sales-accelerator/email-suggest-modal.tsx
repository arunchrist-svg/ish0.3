"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/design-system";
import { AppModal } from "@/components/ui/app-modal";
import { cn } from "@/lib/utils";
import type { EmailPermutation, LeadDetailRecord } from "@/lib/api-client";
import { saveLeadEmails, suggestLeadEmails } from "@/lib/api-client";
import {
  normalizeDomain,
  suggestionsAfterDomainChange,
} from "@/lib/enrichment/email-permutations";

type Props = {
  open: boolean;
  lead: LeadDetailRecord;
  onClose: () => void;
  onSaved: () => void;
};

const DOMAIN_DEBOUNCE_MS = 280;

const labelClass = "mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-brand-ink";
const fieldClass = cn(
  "ish-modal-field w-full rounded-[14px] border border-brand-border/70 px-3.5 py-2.5 text-[13px] font-medium text-brand-ink shadow-[var(--shadow-brand-sm)]",
  "placeholder:text-brand-ink-faint outline-none focus:border-brand-stratus-blue/40 focus:ring-2 focus:ring-brand-stratus-blue/12",
);

export function EmailSuggestModal({ open, lead, onClose, onSaved }: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [domainInput, setDomainInput] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [suggestions, setSuggestions] = useState<EmailPermutation[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [primaryEmail, setPrimaryEmail] = useState("");
  const selectedRef = useRef(selected);
  const primaryEmailRef = useRef(primaryEmail);
  selectedRef.current = selected;
  primaryEmailRef.current = primaryEmail;

  const resolvedDomain = normalizeDomain(domainInput);

  useEffect(() => {
    if (!open) return;
    setError("");
    setSelected([]);
    setPrimaryEmail("");
    setDomainInput("");
    setLoading(true);
    void suggestLeadEmails(lead.id)
      .then((result) => {
        setDomainInput(result.domain);
        setFirstName(result.firstName);
        setLastName(result.lastName);
        setSuggestions(result.suggestions);
        const first = result.suggestions[0]?.email;
        if (first) {
          setSelected([first]);
          setPrimaryEmail(first);
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Could not load email suggestions");
        setSuggestions([]);
      })
      .finally(() => setLoading(false));
  }, [open, lead.id]);

  useEffect(() => {
    if (!open || loading) return;
    const timer = window.setTimeout(() => {
      const next = suggestionsAfterDomainChange({
        firstName,
        lastName,
        domain: domainInput,
        selected: selectedRef.current,
        primaryEmail: primaryEmailRef.current,
      });
      setSuggestions(next.suggestions);
      setSelected(next.selected);
      setPrimaryEmail(next.primaryEmail);
    }, DOMAIN_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [domainInput, firstName, lastName, open, loading]);

  function toggleEmail(email: string) {
    setSelected((prev) => {
      if (prev.includes(email)) {
        const next = prev.filter((item) => item !== email);
        if (primaryEmail === email) {
          setPrimaryEmail(next[0] ?? "");
        }
        return next;
      }
      const next = [...prev, email];
      if (!primaryEmail) setPrimaryEmail(email);
      return next;
    });
  }

  async function handleSave() {
    const next = suggestionsAfterDomainChange({
      firstName,
      lastName,
      domain: domainInput,
      selected,
      primaryEmail,
    });
    if (!next.domain || !next.suggestions.length) {
      setError("Enter a valid company domain.");
      setSuggestions([]);
      setSelected([]);
      setPrimaryEmail("");
      return;
    }
    setSuggestions(next.suggestions);
    setSelected(next.selected);
    setPrimaryEmail(next.primaryEmail);
    if (!next.selected.length) {
      setError("Select at least one email address.");
      return;
    }
    const primary =
      next.primaryEmail && next.selected.includes(next.primaryEmail)
        ? next.primaryEmail
        : next.selected[0];
    if (!primary) {
      setError("Select at least one email address.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await saveLeadEmails(lead.id, {
        emails: next.selected,
        primaryEmail: primary,
        domain: next.domain,
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save email candidates");
    } finally {
      setSaving(false);
    }
  }

  const domainHint = (() => {
    if (loading) return null;
    if (!domainInput.trim()) {
      return "Enter a company domain to generate email guesses.";
    }
    if (!resolvedDomain) {
      return "That does not look like a company domain. Use a host like company.com, or paste the website URL.";
    }
    return null;
  })();

  return (
    <AppModal open={open} onClose={onClose} panelClassName="max-w-lg max-h-[90vh] overflow-y-auto">
      <div className="text-[16px] font-bold text-brand-ink">Suggest emails</div>
      <p className="mt-1.5 text-[13px] leading-relaxed text-brand-ink-soft">
        Free step before paid enrichment. Pick one or more likely addresses. The first outreach send tests the primary email.
      </p>

      {loading ? (
        <div className="flex items-center justify-center py-10 text-brand-ink-soft">
          <Loader2 className="mr-2 size-4 animate-spin text-brand-stratus-blue" />
          Generating patterns...
        </div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass} htmlFor="suggest-email-domain">
                Domain
              </label>
              <input
                id="suggest-email-domain"
                type="text"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                value={domainInput}
                onChange={(e) => {
                  setDomainInput(e.target.value);
                  setError("");
                }}
                onBlur={() => {
                  const normalized = normalizeDomain(domainInput);
                  if (normalized && normalized !== domainInput.trim()) {
                    setDomainInput(normalized);
                  }
                }}
                placeholder="company.com"
                className={fieldClass}
              />
            </div>
            <div>
              <div className={labelClass}>Contact</div>
              <div className={cn(fieldClass, "min-h-[42px]")}>
                {[firstName || lead.firstName, lastName || lead.lastName].filter(Boolean).join(" ") || lead.name}
              </div>
            </div>
          </div>

          {!lastName && !lead.lastName ? (
            <p className="mt-3 rounded-[14px] border border-brand-stratus-salmon/30 bg-brand-pink-soft/60 px-3.5 py-2.5 text-[12px] font-medium text-brand-ink">
              Last name is missing. Fewer patterns are available until the contact name is complete.
            </p>
          ) : null}

          {domainHint ? (
            <p className="mt-3 rounded-[14px] border border-brand-border/70 bg-brand-canvas/60 px-3.5 py-2.5 text-[12px] font-medium text-brand-ink">
              {domainHint}
            </p>
          ) : null}

          <div className="mt-4 max-h-[280px] overflow-y-auto ish-modal-surface rounded-[16px] border border-brand-border/70 shadow-[var(--shadow-brand-sm)]">
            {suggestions.length ? (
              suggestions.map((item) => {
                const checked = selected.includes(item.email);
                const isPrimary = primaryEmail === item.email;
                return (
                  <label
                    key={item.email}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 border-b border-brand-border/50 px-3.5 py-3.5 transition-colors last:border-b-0",
                      checked
                        ? "bg-brand-stratus-blue/8 ring-1 ring-inset ring-brand-stratus-blue/15"
                        : "hover:bg-brand-canvas/60",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleEmail(item.email)}
                      className="mt-0.5 size-4 shrink-0 rounded border-brand-border accent-brand-stratus-blue"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-[13px] font-semibold text-brand-ink">{item.email}</span>
                        <span className="rounded-full bg-brand-stratus-blue/12 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-brand-ink">
                          {item.pattern}
                        </span>
                        {isPrimary && checked ? (
                          <span className="rounded-full bg-brand-stratus-blue/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-brand-stratus-blue">
                            Primary
                          </span>
                        ) : null}
                      </div>
                    </div>
                    {checked ? (
                      <button
                        type="button"
                        className={cn(
                          "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors",
                          isPrimary
                            ? "text-brand-ink-faint"
                            : "text-brand-stratus-blue hover:bg-brand-stratus-blue/10",
                        )}
                        disabled={isPrimary}
                        onClick={(e) => {
                          e.preventDefault();
                          setPrimaryEmail(item.email);
                        }}
                      >
                        {isPrimary ? "Primary" : "Set primary"}
                      </button>
                    ) : null}
                  </label>
                );
              })
            ) : (
              <p className="px-3.5 py-6 text-center text-[12px] font-medium text-brand-ink-soft">
                No email guesses yet.
              </p>
            )}
          </div>
        </>
      )}

      {error ? <p className="mt-3 text-[12px] font-medium text-red-600">{error}</p> : null}

      <div className="mt-5 flex justify-end gap-2 border-t border-brand-border/60 pt-4">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="ish-modal-cancel h-auto rounded-[14px] border border-brand-border px-4 py-2 text-[12px] font-semibold text-brand-ink shadow-[var(--shadow-brand-sm)] hover:border-brand-stratus-blue/30 hover:bg-brand-canvas"
          onClick={onClose}
          disabled={saving}
        >
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={saving || loading || !selected.length || !resolvedDomain}
          className="h-auto rounded-[14px] bg-brand-black px-4 py-2 text-[12px] font-semibold text-white shadow-[var(--shadow-brand-sm)] hover:bg-brand-black/90 disabled:opacity-40"
          onClick={() => void handleSave()}
        >
          {saving ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="size-3.5 animate-spin" />
              Saving...
            </span>
          ) : (
            `Save ${selected.length || ""} email${selected.length === 1 ? "" : "s"}`
          )}
        </Button>
      </div>
    </AppModal>
  );
}

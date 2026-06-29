"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/design-system";
import { AppModal } from "@/components/ui/app-modal";
import { cn } from "@/lib/utils";
import type { EmailPermutation, LeadDetailRecord } from "@/lib/api-client";
import { saveLeadEmails, suggestLeadEmails } from "@/lib/api-client";

type Props = {
  open: boolean;
  lead: LeadDetailRecord;
  onClose: () => void;
  onSaved: () => void;
};

const labelClass = "mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-ish-ink";
const fieldClass = cn(
  "ish-modal-field rounded-[14px] border border-ish-border/70 px-3.5 py-2.5 text-[13px] font-medium text-ish-ink shadow-[var(--shadow-ish-sm)]",
);

export function EmailSuggestModal({ open, lead, onClose, onSaved }: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [domain, setDomain] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [suggestions, setSuggestions] = useState<EmailPermutation[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [primaryEmail, setPrimaryEmail] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    setSelected([]);
    setPrimaryEmail("");
    setLoading(true);
    void suggestLeadEmails(lead.id)
      .then((result) => {
        setDomain(result.domain);
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
    if (!selected.length) {
      setError("Select at least one email address.");
      return;
    }
    const primary = primaryEmail && selected.includes(primaryEmail) ? primaryEmail : selected[0];
    setSaving(true);
    setError("");
    try {
      await saveLeadEmails(lead.id, { emails: selected, primaryEmail: primary });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save email candidates");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppModal open={open} onClose={onClose} panelClassName="max-w-lg max-h-[90vh] overflow-y-auto">
      <div className="text-[16px] font-bold text-ish-ink">Suggest emails</div>
      <p className="mt-1.5 text-[13px] leading-relaxed text-ish-ink-soft">
        Free step before paid enrichment. Pick one or more likely addresses. The first outreach send tests the primary email.
      </p>

      {loading ? (
        <div className="flex items-center justify-center py-10 text-ish-ink-soft">
          <Loader2 className="mr-2 size-4 animate-spin text-ish-stratus-blue" />
          Generating patterns...
        </div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <div className={labelClass}>Domain</div>
              <div className={fieldClass}>{domain || lead.domain || "—"}</div>
            </div>
            <div>
              <div className={labelClass}>Contact</div>
              <div className={fieldClass}>
                {[firstName || lead.firstName, lastName || lead.lastName].filter(Boolean).join(" ") || lead.name}
              </div>
            </div>
          </div>

          {!lastName && !lead.lastName ? (
            <p className="mt-3 rounded-[14px] border border-ish-stratus-salmon/30 bg-ish-pink-soft/60 px-3.5 py-2.5 text-[12px] font-medium text-ish-ink">
              Last name is missing. Fewer patterns are available until the contact name is complete.
            </p>
          ) : null}

          <div className="mt-4 max-h-[280px] overflow-y-auto ish-modal-surface rounded-[16px] border border-ish-border/70 shadow-[var(--shadow-ish-sm)]">
            {suggestions.map((item) => {
              const checked = selected.includes(item.email);
              const isPrimary = primaryEmail === item.email;
              return (
                <label
                  key={item.email}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 border-b border-ish-border/50 px-3.5 py-3.5 transition-colors last:border-b-0",
                    checked
                      ? "bg-ish-stratus-blue/8 ring-1 ring-inset ring-ish-stratus-blue/15"
                      : "hover:bg-ish-canvas/60",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleEmail(item.email)}
                    className="mt-0.5 size-4 shrink-0 rounded border-ish-border accent-ish-stratus-blue"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-[13px] font-semibold text-ish-ink">{item.email}</span>
                      <span className="rounded-full bg-ish-stratus-blue/12 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-ish-ink">
                        {item.pattern}
                      </span>
                      {isPrimary && checked ? (
                        <span className="rounded-full bg-ish-stratus-blue/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-ish-stratus-blue">
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
                          ? "text-ish-ink-faint"
                          : "text-ish-stratus-blue hover:bg-ish-stratus-blue/10",
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
            })}
          </div>
        </>
      )}

      {error ? <p className="mt-3 text-[12px] font-medium text-red-600">{error}</p> : null}

      <div className="mt-5 flex justify-end gap-2 border-t border-ish-border/60 pt-4">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="ish-modal-cancel h-auto rounded-[14px] border border-ish-border px-4 py-2 text-[12px] font-semibold text-ish-ink shadow-[var(--shadow-ish-sm)] hover:border-ish-stratus-blue/30 hover:bg-ish-canvas"
          onClick={onClose}
          disabled={saving}
        >
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={saving || loading || !selected.length}
          className="h-auto rounded-[14px] bg-ish-black px-4 py-2 text-[12px] font-semibold text-white shadow-[var(--shadow-ish-sm)] hover:bg-ish-black/90 disabled:opacity-40"
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

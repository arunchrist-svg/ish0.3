"use client";

import { useEffect, useState } from "react";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/design-system";
import { AppModal } from "@/components/ui/app-modal";
import { cn } from "@/lib/utils";
import type { ContactEmailEntry, LeadDetailRecord } from "@/lib/api-client";
import { saveLeadEmails } from "@/lib/api-client";

type Props = {
  open: boolean;
  lead: LeadDetailRecord;
  emails: ContactEmailEntry[];
  onClose: () => void;
  onSaved: () => void;
};

const labelClass = "mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-brand-ink";
const fieldClass = cn(
  "ish-modal-field w-full rounded-[14px] border border-brand-border/70 px-3.5 py-2.5 text-[13px] font-medium text-brand-ink shadow-[var(--shadow-brand-sm)] outline-none focus:border-brand-stratus-blue/40",
);

function normalizeList(emails: ContactEmailEntry[]): string[] {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const entry of emails) {
    const email = entry.email?.trim() ?? "";
    const key = email.toLowerCase();
    if (!email || email === "—" || seen.has(key)) continue;
    seen.add(key);
    unique.push(email);
  }
  return unique;
}

export function EmailManageModal({ open, lead, emails, onClose, onSaved }: Props) {
  const [rows, setRows] = useState<string[]>([]);
  const [primaryEmail, setPrimaryEmail] = useState("");
  const [draft, setDraft] = useState("");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    const list = normalizeList(emails);
    setRows(list);
    setPrimaryEmail(list[0] ?? "");
    setDraft("");
    setEditingIndex(null);
    setEditValue("");
    setError("");
  }, [open, emails]);

  function addEmail() {
    const value = draft.trim();
    if (!value) {
      setError("Enter an email address.");
      return;
    }
    if (rows.some((email) => email.toLowerCase() === value.toLowerCase())) {
      setError("That email is already on this contact.");
      return;
    }
    setRows((prev) => [...prev, value]);
    if (!primaryEmail) setPrimaryEmail(value);
    setDraft("");
    setError("");
  }

  function startEdit(index: number) {
    setEditingIndex(index);
    setEditValue(rows[index] ?? "");
    setError("");
  }

  function commitEdit() {
    if (editingIndex == null) return;
    const value = editValue.trim();
    if (!value) {
      setError("Email cannot be empty.");
      return;
    }
    const duplicate = rows.some(
      (email, i) => i !== editingIndex && email.toLowerCase() === value.toLowerCase(),
    );
    if (duplicate) {
      setError("That email is already on this contact.");
      return;
    }
    const previous = rows[editingIndex];
    setRows((prev) => prev.map((email, i) => (i === editingIndex ? value : email)));
    if (primaryEmail.toLowerCase() === previous?.toLowerCase()) {
      setPrimaryEmail(value);
    }
    setEditingIndex(null);
    setEditValue("");
    setError("");
  }

  function removeEmail(index: number) {
    const removed = rows[index];
    const next = rows.filter((_, i) => i !== index);
    setRows(next);
    if (primaryEmail.toLowerCase() === removed?.toLowerCase()) {
      setPrimaryEmail(next[0] ?? "");
    }
    if (editingIndex === index) {
      setEditingIndex(null);
      setEditValue("");
    }
    setError("");
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const primary =
        primaryEmail && rows.some((email) => email.toLowerCase() === primaryEmail.toLowerCase())
          ? primaryEmail
          : rows[0];
      await saveLeadEmails(lead.id, {
        emails: rows,
        primaryEmail: primary,
        allowEmpty: rows.length === 0,
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save emails");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppModal open={open} onClose={onClose} panelClassName="max-w-lg max-h-[90vh] overflow-y-auto">
      <div className="text-[16px] font-bold text-brand-ink">Manage emails</div>
      <p className="mt-1.5 text-[13px] leading-relaxed text-brand-ink-soft">
        Add, edit, or remove addresses for this contact. Emails must use the company domain
        {lead.domain ? ` (${lead.domain})` : ""}.
      </p>

      <div className="mt-4">
        <div className={labelClass}>Addresses</div>
        {rows.length ? (
          <div className="ish-modal-surface max-h-[280px] overflow-y-auto rounded-[16px] border border-brand-border/70 shadow-[var(--shadow-brand-sm)]">
            {rows.map((email, index) => {
              const isPrimary = primaryEmail.toLowerCase() === email.toLowerCase();
              const isEditing = editingIndex === index;
              return (
                <div
                  key={`${email}-${index}`}
                  className="border-b border-brand-border/50 px-3.5 py-3 last:border-b-0"
                >
                  {isEditing ? (
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <input
                        type="email"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className={fieldClass}
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            commitEdit();
                          }
                        }}
                      />
                      <div className="flex shrink-0 gap-1.5">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-auto rounded-[12px] bg-brand-black px-3 py-1.5 text-[11px] font-semibold text-white"
                          onClick={commitEdit}
                        >
                          Done
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-auto rounded-[12px] border border-brand-border px-3 py-1.5 text-[11px] font-semibold"
                          onClick={() => {
                            setEditingIndex(null);
                            setEditValue("");
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-[13px] font-semibold text-brand-ink">{email}</span>
                          {isPrimary ? (
                            <span className="rounded-full bg-brand-stratus-blue/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-brand-stratus-blue">
                              Primary
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-0.5">
                        {!isPrimary ? (
                          <button
                            type="button"
                            className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-brand-stratus-blue hover:bg-brand-stratus-blue/10"
                            onClick={() => setPrimaryEmail(email)}
                          >
                            Set primary
                          </button>
                        ) : null}
                        <button
                          type="button"
                          title="Edit email"
                          className="flex size-7 items-center justify-center rounded-full text-brand-ink-soft hover:bg-brand-canvas hover:text-brand-ink"
                          onClick={() => startEdit(index)}
                        >
                          <Pencil className="size-3" />
                        </button>
                        <button
                          type="button"
                          title="Delete email"
                          className="flex size-7 items-center justify-center rounded-full text-brand-ink-soft hover:bg-red-50 hover:text-red-700"
                          onClick={() => removeEmail(index)}
                        >
                          <Trash2 className="size-3" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-[16px] border border-dashed border-brand-border/70 px-3.5 py-6 text-center text-[13px] text-brand-ink-soft">
            No emails yet. Add one below, or clear and save to remove all.
          </div>
        )}
      </div>

      <div className="mt-4">
        <div className={labelClass}>Add email</div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            type="email"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={lead.domain ? `name@${lead.domain}` : "name@company.com"}
            className={fieldClass}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addEmail();
              }
            }}
          />
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-auto shrink-0 rounded-[14px] border border-brand-border px-3.5 py-2.5 text-[12px] font-semibold shadow-[var(--shadow-brand-sm)]"
            onClick={addEmail}
          >
            <span className="inline-flex items-center gap-1.5">
              <Plus className="size-3.5" />
              Add
            </span>
          </Button>
        </div>
      </div>

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
          disabled={saving}
          className="h-auto rounded-[14px] bg-brand-black px-4 py-2 text-[12px] font-semibold text-white shadow-[var(--shadow-brand-sm)] hover:bg-brand-black/90 disabled:opacity-40"
          onClick={() => void handleSave()}
        >
          {saving ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="size-3.5 animate-spin" />
              Saving...
            </span>
          ) : rows.length === 0 ? (
            "Clear emails"
          ) : (
            `Save ${rows.length} email${rows.length === 1 ? "" : "s"}`
          )}
        </Button>
      </div>
    </AppModal>
  );
}

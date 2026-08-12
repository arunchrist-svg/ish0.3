"use client";

import { useMemo, useRef, useState } from "react";
import { FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { AppModal } from "@/components/ui/app-modal";
import { Button } from "@/design-system";
import { cn } from "@/lib/utils";
import {
  confirmLeadImport,
  previewLeadImport,
  type LeadImportColumnMapping,
  type LeadImportConfirmResult,
  type LeadImportPreviewResult,
  type LeadImportTargetField,
} from "@/lib/api-client";

type Step = "upload" | "map" | "done";

type Props = {
  open: boolean;
  onClose: () => void;
  onImported: () => Promise<void> | void;
};

const TARGET_OPTIONS: { value: LeadImportTargetField | ""; label: string }[] = [
  { value: "", label: "Ignore" },
  { value: "name", label: "Full name *" },
  { value: "firstName", label: "First name" },
  { value: "lastName", label: "Last name" },
  { value: "company", label: "Company *" },
  { value: "title", label: "Title" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "linkedIn", label: "LinkedIn" },
  { value: "city", label: "City" },
  { value: "industry", label: "Industry" },
  { value: "employees", label: "Employees" },
  { value: "score", label: "Score" },
  { value: "tags", label: "Tags" },
  { value: "rating", label: "Rating" },
  { value: "owner", label: "Owner" },
];

const labelClass = "mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-brand-ink";
const fieldClass = cn(
  "ish-modal-field w-full rounded-[14px] border border-brand-border/70 px-3 py-2 text-[13px] font-medium text-brand-ink",
  "outline-none shadow-[var(--shadow-brand-sm)] focus:border-brand-stratus-blue/40 focus:ring-2 focus:ring-brand-stratus-blue/12",
);

function mappingReady(mapping: LeadImportColumnMapping): boolean {
  const values = new Set(Object.values(mapping).filter(Boolean));
  const hasName = values.has("name") || (values.has("firstName") && values.has("lastName"));
  return hasName && values.has("company");
}

export function LeadImportModal({ open, onClose, onImported }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("upload");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<LeadImportPreviewResult | null>(null);
  const [mapping, setMapping] = useState<LeadImportColumnMapping>({});
  const [summary, setSummary] = useState<LeadImportConfirmResult | null>(null);

  function reset() {
    setStep("upload");
    setBusy(false);
    setError("");
    setPreview(null);
    setMapping({});
    setSummary(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleClose() {
    if (busy) return;
    reset();
    onClose();
  }

  async function handleFile(file: File) {
    setBusy(true);
    setError("");
    try {
      const data = await previewLeadImport(file);
      setPreview(data);
      setMapping(data.mapping);
      setStep("map");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setBusy(false);
    }
  }

  function updateMapping(header: string, value: string) {
    setMapping((prev) => {
      const next: LeadImportColumnMapping = { ...prev };
      const target = (value || null) as LeadImportTargetField | null;
      if (target) {
        for (const [h, t] of Object.entries(next)) {
          if (h !== header && t === target) next[h] = null;
        }
      }
      next[header] = target;
      return next;
    });
  }

  const canImport = useMemo(() => mappingReady(mapping), [mapping]);

  async function handleImport() {
    if (!preview || !canImport) return;
    setBusy(true);
    setError("");
    try {
      const result = await confirmLeadImport({
        rows: preview.rows,
        mapping,
        enrich: true,
      });
      setSummary(result);
      setStep("done");
      await onImported();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppModal open={open} onClose={handleClose} panelClassName="lg:max-w-2xl">
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-brand-ink-faint">
        Import leads
      </div>
      <h2 className="text-[20px] font-bold tracking-tight text-brand-ink">
        {step === "upload" ? "Upload spreadsheet" : step === "map" ? "Confirm column mapping" : "Import complete"}
      </h2>
      <p className="mt-1.5 text-[13px] leading-relaxed text-brand-ink-soft">
        {step === "upload"
          ? "Upload a CSV or Excel file. AI will map columns to lead fields, then fill missing contact details."
          : step === "map"
            ? "Review AI mapping before creating leads. Missing email, phone, title, or LinkedIn will be enriched automatically."
            : "Leads were created and enrichment ran for rows that needed it."}
      </p>

      {error ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
          {error}
        </div>
      ) : null}

      {step === "upload" ? (
        <div className="mt-5">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            className={cn(
              "flex w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-brand-border bg-brand-canvas/60 px-4 py-10 text-center transition-colors",
              busy ? "opacity-70" : "hover:border-brand-stratus-blue/40 hover:bg-brand-canvas",
            )}
          >
            {busy ? (
              <Loader2 className="size-6 animate-spin text-brand-stratus-blue" />
            ) : (
              <Upload className="size-6 text-brand-stratus-blue" />
            )}
            <div className="text-[14px] font-semibold text-brand-ink">
              {busy ? "Reading file and mapping columns…" : "Drop or choose CSV / Excel"}
            </div>
            <div className="text-[12px] text-brand-ink-faint">Up to 500 rows. First sheet only for Excel.</div>
          </button>
        </div>
      ) : null}

      {step === "map" && preview ? (
        <div className="mt-5 space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-[12px] text-brand-ink-soft">
            <FileSpreadsheet className="size-3.5" />
            <span className="font-medium text-brand-ink">{preview.filename}</span>
            <span>· {preview.rowCount} rows</span>
            <span>
              · AI confidence {Math.round(preview.confidence * 100)}% ({preview.mappingSource})
            </span>
          </div>

          {preview.warnings.length ? (
            <ul className="space-y-1 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
              {preview.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : null}

          <div>
            <label className={labelClass}>Column mapping</label>
            <div className="max-h-[280px] space-y-2 overflow-y-auto rounded-2xl border border-brand-border/70 p-3">
              {preview.headers.map((header) => (
                <div key={header} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_180px] sm:items-center">
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-semibold text-brand-ink">{header}</div>
                    <div className="truncate text-[11px] text-brand-ink-faint">
                      {preview.sampleRows
                        .map((r) => r[header])
                        .filter(Boolean)
                        .slice(0, 2)
                        .join(" · ") || "—"}
                    </div>
                  </div>
                  <select
                    className={fieldClass}
                    value={mapping[header] ?? ""}
                    onChange={(e) => updateMapping(header, e.target.value)}
                  >
                    {TARGET_OPTIONS.map((opt) => (
                      <option key={`${header}-${opt.value || "ignore"}`} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          {!canImport ? (
            <p className="text-[12px] text-amber-800">
              Map a name (or first + last) and company before importing.
            </p>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <Button variant="ghost" type="button" disabled={busy} onClick={reset}>
              Back
            </Button>
            <Button
              type="button"
              disabled={busy || !canImport}
              onClick={() => void handleImport()}
              className="rounded-2xl bg-brand-black px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-brand-black/90 disabled:opacity-50"
            >
              {busy ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin" /> Importing…
                </span>
              ) : (
                `Import ${preview.rowCount} leads`
              )}
            </Button>
          </div>
        </div>
      ) : null}

      {step === "done" && summary ? (
        <div className="mt-5 space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: "Created", value: summary.created },
              { label: "Skipped", value: summary.skipped },
              { label: "Failed", value: summary.failed },
              { label: "Enriched", value: summary.enriched },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl border border-brand-border/70 bg-brand-canvas/50 px-3 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-brand-ink-faint">
                  {item.label}
                </div>
                <div className="mt-1 text-[22px] font-bold text-brand-ink">{item.value}</div>
              </div>
            ))}
          </div>

          {summary.errors.length ? (
            <div className="max-h-32 overflow-y-auto rounded-xl border border-brand-border/70 px-3 py-2 text-[12px] text-brand-ink-soft">
              {summary.errors.slice(0, 20).map((err) => (
                <div key={err}>{err}</div>
              ))}
              {summary.errors.length > 20 ? <div>…and {summary.errors.length - 20} more</div> : null}
            </div>
          ) : null}

          <div className="flex justify-end">
            <Button
              type="button"
              onClick={handleClose}
              className="rounded-2xl bg-brand-black px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-brand-black/90"
            >
              Done
            </Button>
          </div>
        </div>
      ) : null}
    </AppModal>
  );
}

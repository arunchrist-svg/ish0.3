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
import { applyColumnMapping } from "@/lib/leads/import/apply-mapping";

type Step = "upload" | "map" | "done";

type Props = {
  open: boolean;
  onClose: () => void;
  onImported: () => Promise<void> | void;
};

const TARGET_OPTIONS: { value: LeadImportTargetField | ""; label: string }[] = [
  { value: "", label: "Ignore" },
  { value: "name", label: "Full name" },
  { value: "firstName", label: "First name" },
  { value: "lastName", label: "Last name" },
  { value: "company", label: "Company *" },
  { value: "title", label: "Title" },
  { value: "email", label: "Email *" },
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

const SHARED_FIELDS = new Set<LeadImportTargetField>(["tags"]);

const labelClass = "mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-brand-ink";
const fieldClass = cn(
  "ish-modal-field w-full rounded-[14px] border border-brand-border/70 px-3 py-2 text-[13px] font-medium text-brand-ink",
  "outline-none shadow-[var(--shadow-brand-sm)] focus:border-brand-stratus-blue/40 focus:ring-2 focus:ring-brand-stratus-blue/12",
);

function mappingReady(mapping: LeadImportColumnMapping): boolean {
  const values = Object.values(mapping);
  return values.includes("company") && values.includes("email");
}

export function LeadImportModal({ open, onClose, onImported }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("upload");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState<LeadImportPreviewResult | null>(null);
  const [mapping, setMapping] = useState<LeadImportColumnMapping>({});
  const [summary, setSummary] = useState<LeadImportConfirmResult | null>(null);
  const [enrich, setEnrich] = useState(true);

  function reset() {
    setStep("upload");
    setBusy(false);
    setError("");
    setDragOver(false);
    setPreview(null);
    setMapping({});
    setSummary(null);
    setEnrich(true);
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
      setEnrich((data.loadCount ?? data.rowCount) <= 25);
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
      if (target && !SHARED_FIELDS.has(target)) {
        for (const [h, t] of Object.entries(next)) {
          if (h !== header && t === target) next[h] = null;
        }
      }
      next[header] = target;
      return next;
    });
  }

  const canImport = useMemo(() => mappingReady(mapping), [mapping]);
  const loadCount = useMemo(() => {
    if (!preview) return 0;
    if (typeof preview.loadCount === "number" && mapping === preview.mapping) return preview.loadCount;
    return applyColumnMapping(preview.rows, mapping).rows.length;
  }, [preview, mapping]);

  async function handleImport() {
    if (!preview || !canImport) return;
    setBusy(true);
    setError("");
    try {
      const result = await confirmLeadImport({
        rows: preview.rows,
        mapping,
        enrich: loadCount <= 25 && enrich,
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
      <h3 className="pr-10 text-[16px] font-bold tracking-tight text-brand-ink">
        {step === "upload" ? "Upload spreadsheet" : step === "map" ? "Confirm columns" : "Import complete"}
      </h3>

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
            onDragOver={(e) => {
              e.preventDefault();
              if (!busy) setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const file = e.dataTransfer.files?.[0];
              if (file) void handleFile(file);
            }}
            className={cn(
              "flex w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed px-4 py-10 text-center transition-colors",
              dragOver
                ? "border-brand-stratus-blue bg-brand-canvas"
                : "border-brand-border bg-brand-canvas/60",
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
            <div className="text-[12px] text-brand-ink-faint">CSV or Excel, first sheet</div>
          </button>
          <div className="mt-5 flex justify-end gap-2 border-t border-brand-border/60 pt-4">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ish-modal-cancel h-auto rounded-[14px] border border-brand-border px-4 py-2 text-[12px] font-semibold text-brand-ink shadow-[var(--shadow-brand-sm)] hover:border-brand-stratus-blue/30 hover:bg-brand-canvas"
              onClick={handleClose}
              disabled={busy}
            >
              Cancel
            </Button>
          </div>
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

          <label className="flex items-start gap-2 text-[13px] text-brand-ink-soft">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={enrich && loadCount <= 25}
              disabled={loadCount > 25}
              onChange={(e) => setEnrich(e.target.checked)}
            />
            <span>
              Fill missing contact details after import.
              {loadCount > 25
                ? " Off for large lists so the load stays fast. Enrich individual leads afterward."
                : " Email, phone, title, and LinkedIn are filled when missing."}
            </span>
          </label>

          {!canImport ? (
            <p className="text-[12px] text-amber-800">Map company and email columns before importing.</p>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2 border-t border-brand-border/60 pt-4">
            <Button
              variant="ghost"
              type="button"
              size="sm"
              disabled={busy}
              className="ish-modal-cancel h-auto rounded-[14px] border border-brand-border px-4 py-2 text-[12px] font-semibold text-brand-ink shadow-[var(--shadow-brand-sm)] hover:border-brand-stratus-blue/30 hover:bg-brand-canvas"
              onClick={reset}
            >
              Back
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy || !canImport}
              onClick={() => void handleImport()}
              className="ish-scout-cta-blue h-auto rounded-[14px] px-4 py-2 text-[12px] font-semibold text-white disabled:opacity-50"
            >
              {busy ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin" /> Loading leads…
                </span>
              ) : (
                `Load ${loadCount} with email`
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

          {summary.warnings?.length ? (
            <ul className="space-y-1 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
              {summary.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : null}

          {summary.errors.length ? (
            <div className="max-h-32 overflow-y-auto rounded-xl border border-brand-border/70 px-3 py-2 text-[12px] text-brand-ink-soft">
              {summary.errors.slice(0, 20).map((err) => (
                <div key={err}>{err}</div>
              ))}
              {summary.errors.length > 20 ? <div>…and {summary.errors.length - 20} more</div> : null}
            </div>
          ) : null}

          <div className="flex justify-end gap-2 border-t border-brand-border/60 pt-4">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClose}
              className="ish-scout-cta-blue h-auto rounded-[14px] px-4 py-2 text-[12px] font-semibold text-white"
            >
              Done
            </Button>
          </div>
        </div>
      ) : null}
    </AppModal>
  );
}

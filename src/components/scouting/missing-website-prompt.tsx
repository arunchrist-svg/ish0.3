"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { parsePastedCompanyWebsite } from "@/lib/enrichment/company-domain-quality";

export type MissingWebsiteCompany = {
  id: string;
  name: string;
};

export type WebsitePasteEntry = {
  companyId: string;
  website: string;
};

export type WebsiteRowStatus = "idle" | "queued" | "fetching" | "done" | "error" | "no_match";

type Props = {
  companies: MissingWebsiteCompany[];
  applying?: boolean;
  applyingIds?: Set<string> | string[];
  rowStatus?: Record<string, WebsiteRowStatus>;
  onFetch: (entries: WebsitePasteEntry[]) => void | Promise<void>;
  className?: string;
  /** Compact layout when embedded above an existing people grid. */
  compact?: boolean;
};

function statusLabel(status: WebsiteRowStatus | undefined): string | null {
  if (!status || status === "idle") return null;
  if (status === "queued") return "Queued";
  if (status === "fetching") return "Fetching";
  if (status === "done") return "Done";
  if (status === "no_match") return "No match";
  if (status === "error") return "Failed";
  return null;
}

export function MissingWebsitePrompt({
  companies,
  applying = false,
  applyingIds,
  rowStatus,
  onFetch,
  className,
  compact = false,
}: Props) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [collapsed, setCollapsed] = useState(false);
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});

  const companyIds = companies.map((c) => c.id).join("|");
  useEffect(() => {
    setValues((prev) => {
      const next: Record<string, string> = {};
      for (const company of companies) {
        next[company.id] = prev[company.id] ?? "";
      }
      return next;
    });
    setLocalErrors({});
    // Reset form fields when the set of missing companies changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyIds]);

  const applyingSet = useMemo(() => {
    if (!applyingIds) return new Set<string>();
    return applyingIds instanceof Set ? applyingIds : new Set(applyingIds);
  }, [applyingIds]);

  const filledEntries = useMemo(() => {
    const entries: WebsitePasteEntry[] = [];
    for (const company of companies) {
      const raw = values[company.id]?.trim() ?? "";
      if (!raw) continue;
      const parsed = parsePastedCompanyWebsite(raw);
      if (parsed.domain) {
        entries.push({ companyId: company.id, website: raw });
      }
    }
    return entries;
  }, [companies, values]);

  if (!companies.length) return null;

  function handleFetch() {
    const errors: Record<string, string> = {};
    const entries: WebsitePasteEntry[] = [];
    for (const company of companies) {
      const raw = values[company.id]?.trim() ?? "";
      if (!raw) continue;
      const parsed = parsePastedCompanyWebsite(raw);
      if (!parsed.domain) {
        errors[company.id] = "Use company.com, not Zauba or IndiaMART.";
        continue;
      }
      entries.push({ companyId: company.id, website: raw });
    }
    setLocalErrors(errors);
    if (!entries.length) return;
    void onFetch(entries);
  }

  return (
    <div
      className={cn(
        "overflow-hidden rounded-[18px] border border-brand-stratus-yellow/35 bg-white/90 shadow-[var(--shadow-brand-sm)]",
        "backdrop-blur-sm",
        className,
      )}
    >
      <div className="relative border-b border-brand-border/50 px-3.5 py-2.5">
        <div className="ish-board-hero-stripe pointer-events-none absolute inset-x-0 top-0" aria-hidden />
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[13px] font-bold tracking-tight text-brand-ink">Need websites</p>
            <p className="text-[11px] text-brand-ink-faint">
              {companies.length} compan{companies.length === 1 ? "y" : "ies"} · paste official sites, then fetch
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="flex size-8 shrink-0 items-center justify-center rounded-full text-brand-ink-soft hover:bg-brand-canvas hover:text-brand-ink"
            aria-label={collapsed ? "Expand website panel" : "Collapse website panel"}
          >
            {collapsed ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
          </button>
        </div>
      </div>

      {!collapsed ? (
        <>
          <div className={cn("space-y-2 overflow-y-auto px-3.5 py-3", compact ? "max-h-[220px]" : "max-h-[320px]")}>
            {companies.map((company) => {
              const status = applyingSet.has(company.id)
                ? "fetching"
                : (rowStatus?.[company.id] ?? "idle");
              const label = statusLabel(status);
              return (
                <div key={company.id} className="rounded-[14px] border border-brand-border/60 bg-white/80 px-3 py-2.5">
                  <div className="mb-1.5 flex items-start justify-between gap-2">
                    <label
                      htmlFor={`website-${company.id}`}
                      className="min-w-0 text-[12px] font-semibold leading-snug text-brand-ink"
                    >
                      {company.name}
                    </label>
                    {label ? (
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide",
                          status === "fetching" || status === "queued"
                            ? "bg-brand-stratus-blue/15 text-brand-stratus-blue"
                            : status === "done"
                              ? "bg-brand-stratus-blue/10 text-brand-ink"
                              : status === "error" || status === "no_match"
                                ? "bg-brand-stratus-salmon/15 text-brand-ink-soft"
                                : "bg-brand-canvas text-brand-ink-faint",
                        )}
                      >
                        {label}
                      </span>
                    ) : null}
                  </div>
                  <div className="relative">
                    <Globe className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-brand-ink-faint" />
                    <input
                      id={`website-${company.id}`}
                      value={values[company.id] ?? ""}
                      onChange={(event) => {
                        const next = event.target.value;
                        setValues((prev) => ({ ...prev, [company.id]: next }));
                        if (localErrors[company.id]) {
                          setLocalErrors((prev) => {
                            const copy = { ...prev };
                            delete copy[company.id];
                            return copy;
                          });
                        }
                      }}
                      placeholder="https://company.com"
                      autoComplete="url"
                      inputMode="url"
                      disabled={applying}
                      className="ish-modal-field h-9 w-full rounded-[12px] border border-brand-border/70 bg-white pl-8 pr-2.5 text-[12px] text-brand-ink outline-none placeholder:text-brand-ink-faint"
                    />
                  </div>
                  {localErrors[company.id] ? (
                    <p className="mt-1 text-[11px] font-medium text-red-600">{localErrors[company.id]}</p>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-brand-border/60 bg-white/95 px-3.5 py-2.5">
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              disabled={applying}
              className="ish-modal-cancel h-9 rounded-[12px] border border-brand-border px-3.5 text-[12px] font-semibold text-brand-ink disabled:opacity-50"
            >
              Collapse
            </button>
            <button
              type="button"
              onClick={handleFetch}
              disabled={applying || filledEntries.length === 0}
              className="ish-scout-cta-blue h-9 rounded-[12px] px-3.5 text-[12px] font-semibold text-white disabled:opacity-40"
            >
              {applying
                ? "Fetching…"
                : filledEntries.length === 1
                  ? "Fetch from 1 site"
                  : `Fetch from ${filledEntries.length || "—"} sites`}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

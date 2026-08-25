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
  const [hideDone, setHideDone] = useState(true);

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

  const doneCount = useMemo(
    () => companies.filter((c) => (rowStatus?.[c.id] ?? "idle") === "done").length,
    [companies, rowStatus],
  );

  const visibleCompanies = useMemo(() => {
    if (!hideDone) return companies;
    const pending = companies.filter((c) => (rowStatus?.[c.id] ?? "idle") !== "done");
    return pending.length ? pending : companies;
  }, [companies, hideDone, rowStatus]);

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

  function setWebsite(companyId: string, next: string) {
    setValues((prev) => ({ ...prev, [companyId]: next }));
    if (localErrors[companyId]) {
      setLocalErrors((prev) => {
        const copy = { ...prev };
        delete copy[companyId];
        return copy;
      });
    }
  }

  return (
    <div
      className={cn(
        "overflow-hidden rounded-[16px] border border-brand-stratus-yellow/35 bg-white/90 shadow-[var(--shadow-brand-sm)]",
        "backdrop-blur-sm",
        className,
      )}
    >
      <div className="relative border-b border-brand-border/50 px-3 py-2">
        <div className="ish-board-hero-stripe pointer-events-none absolute inset-x-0 top-0" aria-hidden />
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <p className="text-[13px] font-bold tracking-tight text-brand-ink">Need websites</p>
              <p className="text-[11px] text-brand-ink-faint">
                {filledEntries.length}/{companies.length} ready
                {doneCount > 0 ? ` · ${doneCount} done` : ""}
              </p>
            </div>
          </div>
          {doneCount > 0 ? (
            <button
              type="button"
              onClick={() => setHideDone((v) => !v)}
              className="shrink-0 rounded-full px-2 py-1 text-[10.5px] font-semibold text-brand-stratus-blue hover:bg-brand-stratus-blue/10"
            >
              {hideDone ? "Show done" : "Hide done"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="flex size-7 shrink-0 items-center justify-center rounded-full text-brand-ink-soft hover:bg-brand-canvas hover:text-brand-ink"
            aria-label={collapsed ? "Expand website panel" : "Collapse website panel"}
          >
            {collapsed ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
          </button>
        </div>
      </div>

      {!collapsed ? (
        <>
          <div
            className={cn(
              "divide-y divide-brand-border/50 overflow-y-auto",
              compact ? "max-h-[min(28vh,200px)]" : "max-h-[min(36vh,260px)]",
            )}
          >
            {visibleCompanies.map((company) => {
              const status = applyingSet.has(company.id)
                ? "fetching"
                : (rowStatus?.[company.id] ?? "idle");
              const label = statusLabel(status);
              const error = localErrors[company.id];
              return (
                <div key={company.id} className="px-3 py-1.5 hover:bg-brand-canvas/40">
                  <div className="flex items-center gap-2">
                    <label
                      htmlFor={`website-${company.id}`}
                      className="w-[7.5rem] shrink-0 truncate text-[11.5px] font-semibold text-brand-ink sm:w-[9.5rem]"
                      title={company.name}
                    >
                      {company.name}
                    </label>
                    <div className="relative min-w-0 flex-1">
                      <Globe className="pointer-events-none absolute left-2 top-1/2 size-3 -translate-y-1/2 text-brand-ink-faint" />
                      <input
                        id={`website-${company.id}`}
                        value={values[company.id] ?? ""}
                        onChange={(event) => setWebsite(company.id, event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" && filledEntries.length > 0 && !applying) {
                            event.preventDefault();
                            handleFetch();
                          }
                        }}
                        placeholder="company.com"
                        autoComplete="url"
                        inputMode="url"
                        disabled={applying || status === "done"}
                        className={cn(
                          "h-8 w-full rounded-lg border bg-white pl-7 pr-2 text-[11.5px] text-brand-ink outline-none placeholder:text-brand-ink-faint",
                          error
                            ? "border-red-400/70"
                            : "border-brand-border/60 focus:border-brand-stratus-blue/50",
                          status === "done" && "bg-brand-canvas/60 text-brand-ink-soft",
                        )}
                      />
                    </div>
                    {label ? (
                      <span
                        className={cn(
                          "hidden w-14 shrink-0 truncate text-center text-[9px] font-bold uppercase tracking-wide sm:inline",
                          status === "fetching" || status === "queued"
                            ? "text-brand-stratus-blue"
                            : status === "done"
                              ? "text-brand-ink-soft"
                              : status === "error" || status === "no_match"
                                ? "text-red-600"
                                : "text-brand-ink-faint",
                        )}
                      >
                        {label}
                      </span>
                    ) : (
                      <span className="hidden w-14 shrink-0 sm:block" aria-hidden />
                    )}
                  </div>
                  {error ? (
                    <p className="mt-0.5 pl-[7.5rem] text-[10px] font-medium text-red-600 sm:pl-[9.5rem]">
                      {error}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-brand-border/60 bg-white/95 px-3 py-2">
            <p className="min-w-0 truncate text-[10.5px] text-brand-ink-faint">
              Paste official domains · Enter to fetch
            </p>
            <button
              type="button"
              onClick={handleFetch}
              disabled={applying || filledEntries.length === 0}
              className="ish-scout-cta-blue h-8 shrink-0 rounded-[10px] px-3 text-[12px] font-semibold text-white disabled:opacity-40"
            >
              {applying
                ? "Fetching…"
                : filledEntries.length === 0
                  ? "Fetch sites"
                  : filledEntries.length === 1
                    ? "Fetch 1 site"
                    : `Fetch ${filledEntries.length} sites`}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Pin, Building2, User, MapPin, Mail, ArrowRight, PinOff,
  Sparkles, Search, RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchPins, togglePin, type PinnedLead, type PinnedCompany } from "@/lib/api-client";
import { IshAvatar, ScoreBadge, text } from "@/design-system";
import { CompanyLogo } from "@/components/company/company-logo";
import { deriveQueueAction, statusToDisplayLabel } from "@/lib/pipeline-status";
import { toast } from "sonner";

export function PinnedApp() {
  const [leads, setLeads] = useState<PinnedLead[]>([]);
  const [companies, setCompanies] = useState<PinnedCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");

  async function load(opts?: { silent?: boolean }) {
    if (!opts?.silent) setLoading(true);
    else setRefreshing(true);
    try {
      const data = await fetchPins();
      setLeads(data.leads);
      setCompanies(data.companies);
    } catch {
      toast.error("Could not load pinned items");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handlePinOff(type: "lead" | "company", id: string) {
    try {
      await togglePin(type, id, false);
      toast.success("Unpinned");
      load({ silent: true });
    } catch {
      toast.error("Failed to unpin");
    }
  }

  const q = search.trim().toLowerCase();
  const filteredLeads = useMemo(() => {
    if (!q) return leads;
    return leads.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        l.company.toLowerCase().includes(q) ||
        l.title.toLowerCase().includes(q) ||
        l.city.toLowerCase().includes(q),
    );
  }, [leads, q]);

  const filteredCompanies = useMemo(() => {
    if (!q) return companies;
    return companies.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.industry ?? "").toLowerCase().includes(q) ||
        (c.city ?? "").toLowerCase().includes(q),
    );
  }, [companies, q]);

  const isEmpty = leads.length === 0 && companies.length === 0;
  const noResults = !loading && !isEmpty && filteredLeads.length === 0 && filteredCompanies.length === 0;

  return (
    <div className="ish-pinned-page flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <header className="ish-pinned-hero relative shrink-0 overflow-hidden border-b border-ish-border/60 px-6 py-5">
        <div className="ish-pinned-hero-stripe pointer-events-none absolute inset-x-0 top-0 h-[3px]" aria-hidden />
        <div className="relative flex flex-wrap items-center gap-4">
          <div className="flex min-w-0 flex-1 items-center gap-3.5">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-ish-yellow shadow-[var(--shadow-ish-yellow-sm)]">
              <Pin className="size-5 text-ish-ink" />
            </div>
            <div className="min-w-0">
              <h1 className="text-[20px] font-extrabold tracking-tight text-ish-ink">Pinned</h1>
              <p className="text-[12.5px] text-ish-ink-soft">Your priority leads and companies — one tap away</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-[220px] max-w-full">
              <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-ish-ink-faint" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search pins…"
                className="w-full rounded-full border border-ish-border/70 bg-white/70 py-2 pl-9 pr-3 text-[12px] text-ish-ink outline-none backdrop-blur-sm transition-colors focus:border-[rgba(var(--ish-stratus-blue-rgb),0.45)] focus:bg-white"
              />
            </div>
            <button
              type="button"
              onClick={() => load({ silent: true })}
              disabled={refreshing}
              className="flex size-9 items-center justify-center rounded-full border border-ish-border/70 bg-white/70 text-ish-ink-soft transition-all hover:border-ish-ink/20 hover:text-ish-ink active:scale-95"
              aria-label="Refresh"
            >
              <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
            </button>
          </div>
        </div>

        {!loading && !isEmpty && (
          <div className="relative mt-4 flex flex-wrap gap-2">
            <StatPill icon={User} label="Leads" value={leads.length} tone="yellow" />
            <StatPill icon={Building2} label="Companies" value={companies.length} tone="blue" />
          </div>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-none px-6 py-6">
        {loading ? (
          <PinnedSkeleton />
        ) : isEmpty ? (
          <EmptyState />
        ) : noResults ? (
          <div className="flex flex-col items-center justify-center gap-2 py-20 text-center">
            <Search className="size-8 text-ish-ink-faint" />
            <div className="text-[14px] font-semibold text-ish-ink">No matches</div>
            <p className="text-[12px] text-ish-ink-soft">Try a different search term</p>
          </div>
        ) : (
          <div className="mx-auto max-w-6xl space-y-10">
            {filteredLeads.length > 0 && (
              <section>
                <SectionLabel icon={User} title="Pinned Leads" count={filteredLeads.length} />
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {filteredLeads.map((lead, i) => (
                    <PinnedLeadCard key={lead.id} lead={lead} index={i} onPinOff={() => handlePinOff("lead", lead.id)} />
                  ))}
                </div>
              </section>
            )}

            {filteredCompanies.length > 0 && (
              <section>
                <SectionLabel icon={Building2} title="Pinned Companies" count={filteredCompanies.length} />
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {filteredCompanies.map((company) => (
                    <PinnedCompanyCard key={company.id} company={company} onPinOff={() => handlePinOff("company", company.id)} />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StatPill({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof User;
  label: string;
  value: number;
  tone: "yellow" | "blue";
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[11px] font-semibold",
        tone === "yellow" ? "bg-ish-yellow/35 text-ish-ink" : "bg-ish-green/12 text-ish-ink",
      )}
    >
      <Icon className="size-3.5 opacity-70" />
      <span className="text-ish-ink-faint">{label}</span>
      <span className="font-extrabold text-ish-ink">{value}</span>
    </div>
  );
}

function SectionLabel({
  icon: Icon,
  title,
  count,
}: {
  icon: typeof User;
  title: string;
  count: number;
}) {
  return (
    <div className="mb-4 flex items-center gap-2.5">
      <div className="flex size-7 items-center justify-center rounded-lg bg-white/80 shadow-[var(--shadow-ish-sm)]">
        <Icon className="size-3.5 text-ish-ink-soft" />
      </div>
      <h2 className="text-[13px] font-bold uppercase tracking-wider text-ish-ink">{title}</h2>
      <span className="rounded-full bg-ish-canvas px-2 py-0.5 text-[10px] font-bold text-ish-ink-faint">{count}</span>
    </div>
  );
}

function PinnedLeadCard({
  lead,
  index,
  onPinOff,
}: {
  lead: PinnedLead;
  index: number;
  onPinOff: () => void;
}) {
  const action = deriveQueueAction(lead.status);
  const stage = statusToDisplayLabel(lead.status);

  return (
    <article className="ish-pinned-lead-card group relative overflow-hidden rounded-[20px] transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5">
      <div className="ish-pinned-lead-card-accent pointer-events-none absolute inset-x-0 top-0 h-1" aria-hidden />

      <div className="p-4 pb-3">
        <div className="mb-3.5 flex items-start justify-between gap-2">
          <div className="flex min-w-0 gap-3">
            <IshAvatar name={lead.name} index={index} size={48} />
            <div className="min-w-0 pt-0.5">
              <div className="truncate text-[15px] font-bold leading-tight text-ish-ink">{lead.name}</div>
              <div className="mt-0.5 truncate text-[12px] font-medium text-ish-ink-soft">{lead.title}</div>
              <div className="mt-1.5 flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-wide text-ish-green">
                <Sparkles className="size-3 shrink-0" />
                {action}
              </div>
            </div>
          </div>
          <ScoreBadge score={lead.score ?? 0} />
        </div>

        <div className="mb-3 flex items-center gap-2.5 rounded-xl bg-white/50 px-2.5 py-2">
          <CompanyLogo name={lead.company} size="sm" rounded="rounded-lg" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12px] font-semibold text-ish-ink">{lead.company}</div>
            <div className="mt-0.5 flex items-center gap-1 text-[11px] text-ish-ink-faint">
              <MapPin className="size-3 shrink-0" />
              <span className="truncate">{lead.city}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-full bg-white/65 px-2.5 py-1 text-[10.5px] font-bold text-ish-ink-soft">
            {stage}
          </span>
          <EmailStatusChip status={lead.emailStatus} />
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-black/[0.05] bg-white/30 px-4 py-3">
        <Link
          href={`/leads?lead=${lead.id}`}
          className="ish-pinned-cta flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-[12px] font-bold text-ish-ink transition-all active:scale-[0.98]"
        >
          Open Lead
          <ArrowRight className="size-3.5" />
        </Link>
        <button
          type="button"
          onClick={onPinOff}
          className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-transparent text-ish-ink-faint transition-all hover:border-ish-border/80 hover:bg-white/60 hover:text-ish-ink"
          title="Unpin"
          aria-label="Unpin lead"
        >
          <PinOff className="size-3.5" />
        </button>
      </div>
    </article>
  );
}

function PinnedCompanyCard({
  company,
  onPinOff,
}: {
  company: PinnedCompany;
  onPinOff: () => void;
}) {
  return (
    <article className="ish-pinned-company-card group relative overflow-hidden rounded-[20px] transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5">
      <div className="p-4 pb-3">
        <div className="mb-3.5 flex items-start justify-between gap-3">
          <CompanyLogo name={company.name} size="lg" rounded="rounded-xl" />
          <button
            type="button"
            onClick={onPinOff}
            className="flex size-8 shrink-0 items-center justify-center rounded-full text-ish-ink-faint opacity-0 transition-all hover:bg-white/70 hover:text-ish-ink group-hover:opacity-100"
            title="Unpin"
            aria-label="Unpin company"
          >
            <PinOff className="size-3.5" />
          </button>
        </div>

        <div className="mb-1 truncate text-[15px] font-bold text-ish-ink">{company.name}</div>
        <div className="mb-3 truncate text-[12px] text-ish-ink-soft">{company.industry ?? "—"}</div>

        <div className="mb-3 flex items-center gap-1.5 text-[11px] text-ish-ink-faint">
          <MapPin className="size-3 shrink-0" />
          <span className="truncate">{company.city ?? "—"}</span>
          {company.employees && (
            <>
              <span className="text-ish-border">·</span>
              <span className="shrink-0">{company.employees} employees</span>
            </>
          )}
        </div>

        {company.giftScore ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-ish-green/12 px-2.5 py-1 text-[10.5px] font-bold text-ish-green">
            <Sparkles className="size-3" />
            Gift Score {company.giftScore}
          </span>
        ) : null}
      </div>

      <div className="border-t border-black/[0.05] bg-white/30 px-4 py-3">
        <Link
          href={`/directory?company=${company.id}`}
          className="ish-pinned-cta flex w-full items-center justify-center gap-1.5 rounded-xl py-2.5 text-[12px] font-bold text-ish-ink transition-all active:scale-[0.98]"
        >
          View in Directory
          <ArrowRight className="size-3.5" />
        </Link>
      </div>
    </article>
  );
}

function EmailStatusChip({ status }: { status: string }) {
  const tone =
    status === "verified"
      ? "bg-ish-green/15 text-ish-green"
      : status === "unverified"
        ? "bg-[#e8a000]/15 text-[#b87d00]"
        : "bg-ish-canvas text-ish-ink-faint";

  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10.5px] font-bold", tone)}>
      <Mail className="size-2.5" />
      {status}
    </span>
  );
}

function EmptyState() {
  return (
    <div className="ish-pinned-empty mx-auto flex max-w-md flex-col items-center justify-center gap-4 py-20 text-center">
      <div className="flex size-16 items-center justify-center rounded-[22px] bg-ish-yellow/40 shadow-[var(--shadow-ish-yellow-sm)]">
        <Pin className="size-7 text-ish-ink" />
      </div>
      <div>
        <div className={cn(text.body, "font-bold")}>No pinned items yet</div>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-ish-ink-soft">
          Pin leads from Lead Accelerator or companies from Directory — they&apos;ll show up here for quick access.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2 pt-2">
        <Link
          href="/leads"
          className="ish-pinned-cta rounded-full px-4 py-2 text-[12px] font-bold text-ish-ink"
        >
          Go to Leads
        </Link>
        <Link
          href="/directory"
          className="rounded-full border border-ish-border/80 bg-white/70 px-4 py-2 text-[12px] font-semibold text-ish-ink-soft transition-colors hover:text-ish-ink"
        >
          Browse Directory
        </Link>
      </div>
    </div>
  );
}

function PinnedSkeleton() {
  return (
    <div className="mx-auto max-w-6xl space-y-10">
      <div>
        <div className="mb-4 h-7 w-40 animate-pulse rounded-lg bg-ish-border/50" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-[220px] animate-pulse rounded-[20px] bg-ish-border/40" />
          ))}
        </div>
      </div>
    </div>
  );
}

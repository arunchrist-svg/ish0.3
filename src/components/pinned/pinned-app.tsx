"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Pin, Building2, User, MapPin, Mail, ArrowRight, PinOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchPins, togglePin, type PinnedLead, type PinnedCompany } from "@/lib/api-client";
import { toast } from "sonner";

export function PinnedApp() {
  const [leads, setLeads] = useState<PinnedLead[]>([]);
  const [companies, setCompanies] = useState<PinnedCompany[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const data = await fetchPins();
      setLeads(data.leads);
      setCompanies(data.companies);
    } catch {
      toast.error("Could not load pinned items");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handlePinOff(type: "lead" | "company", id: string) {
    try {
      await togglePin(type, id, false);
      toast.success("PinOffned");
      load();
    } catch {
      toast.error("Failed to unpin");
    }
  }

  const isEmpty = leads.length === 0 && companies.length === 0;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-3 border-b border-ish-border bg-white px-6 py-4">
        <div className="flex size-9 items-center justify-center rounded-xl bg-ish-yellow shadow-[var(--shadow-ish-yellow-sm)]">
          <Pin className="size-4 text-ish-ink" />
        </div>
        <div>
          <h1 className="text-[16px] font-bold text-ish-ink">Pinned</h1>
          <p className="text-[12px] text-ish-ink-soft">Quick access to important leads and companies</p>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex h-40 items-center justify-center text-[13px] text-ish-ink-faint">
            <span className="mr-2 animate-spin">⟳</span> Loading…
          </div>
        ) : isEmpty ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-ish-canvas">
              <Pin className="size-6 text-ish-ink-faint" />
            </div>
            <div className="text-[14px] font-semibold text-ish-ink">No pinned items yet</div>
            <p className="max-w-xs text-[12px] text-ish-ink-soft">
              Pin leads or companies from the Lead Accelerator or Directory to access them quickly here.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {leads.length > 0 && (
              <div>
                <div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-ish-ink-faint">
                  <User className="size-3.5" />
                  Pinned Leads ({leads.length})
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {leads.map((lead) => (
                    <LeadCard key={lead.id} lead={lead} onPinOff={() => handlePinOff("lead", lead.id)} />
                  ))}
                </div>
              </div>
            )}

            {companies.length > 0 && (
              <div>
                <div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-ish-ink-faint">
                  <Building2 className="size-3.5" />
                  Pinned Companies ({companies.length})
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {companies.map((company) => (
                    <CompanyCard key={company.id} company={company} onPinOff={() => handlePinOff("company", company.id)} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function LeadCard({ lead, onPinOff }: { lead: PinnedLead; onPinOff: () => void }) {
  return (
    <div className="group relative rounded-[18px] border border-ish-border bg-white p-4 shadow-[var(--shadow-ish-sm)] transition-shadow hover:shadow-[var(--shadow-ish)]">
      <button
        onClick={onPinOff}
        className="absolute right-3 top-3 rounded-full p-1.5 text-ish-ink-faint opacity-0 transition-opacity hover:bg-ish-canvas hover:text-ish-ink group-hover:opacity-100"
        title="PinOff"
      >
        <PinOff className="size-3.5" />
      </button>

      <div className="mb-3">
        <div className="text-[14px] font-bold text-ish-ink">{lead.name}</div>
        <div className="text-[12px] text-ish-ink-soft">{lead.title}</div>
      </div>

      <div className="mb-3 flex items-center gap-1.5 text-[11px] text-ish-ink-faint">
        <Building2 className="size-3" />
        {lead.company}
        <span className="mx-1">·</span>
        <MapPin className="size-3" />
        {lead.city}
      </div>

      <div className="mb-3 flex items-center gap-2">
        <span className={cn(
          "rounded-full px-2 py-0.5 text-[10px] font-bold",
          lead.emailStatus === "verified" ? "bg-ish-green/15 text-ish-green" :
          lead.emailStatus === "unverified" ? "bg-[#e8a000]/15 text-[#b87d00]" :
          "bg-ish-canvas text-ish-ink-faint"
        )}>
          <Mail className="mr-1 inline size-2.5" />
          {lead.emailStatus}
        </span>
        <span className="rounded-full bg-ish-canvas px-2 py-0.5 text-[10px] font-bold text-ish-ink-soft">
          Score: {lead.score ?? "—"}
        </span>
      </div>

      <Link
        href={`/?lead=${lead.id}`}
        className="flex items-center gap-1 text-[11px] font-semibold text-ish-ink hover:underline"
      >
        Open Lead <ArrowRight className="size-3" />
      </Link>
    </div>
  );
}

function CompanyCard({ company, onPinOff }: { company: PinnedCompany; onPinOff: () => void }) {
  return (
    <div className="group relative rounded-[18px] border border-ish-border bg-white p-4 shadow-[var(--shadow-ish-sm)] transition-shadow hover:shadow-[var(--shadow-ish)]">
      <button
        onClick={onPinOff}
        className="absolute right-3 top-3 rounded-full p-1.5 text-ish-ink-faint opacity-0 transition-opacity hover:bg-ish-canvas hover:text-ish-ink group-hover:opacity-100"
        title="PinOff"
      >
        <PinOff className="size-3.5" />
      </button>

      <div className="mb-3">
        <div className="text-[14px] font-bold text-ish-ink">{company.name}</div>
        <div className="text-[12px] text-ish-ink-soft">{company.industry ?? "—"}</div>
      </div>

      <div className="mb-3 flex items-center gap-1.5 text-[11px] text-ish-ink-faint">
        <MapPin className="size-3" />
        {company.city ?? "—"}
        <span className="mx-1">·</span>
        {company.employees ?? "—"} employees
      </div>

      {company.giftScore && (
        <div className="mb-3">
          <span className="rounded-full bg-ish-green/15 px-2 py-0.5 text-[10px] font-bold text-ish-green">
            Gift Score: {company.giftScore}
          </span>
        </div>
      )}

      <Link
        href={`/directory?company=${company.id}`}
        className="flex items-center gap-1 text-[11px] font-semibold text-ish-ink hover:underline"
      >
        View in Directory <ArrowRight className="size-3" />
      </Link>
    </div>
  );
}

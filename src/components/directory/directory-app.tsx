"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppShell, SegmentedTabs } from "@/design-system";
import { TopBar } from "@/components/sales-accelerator/top-bar";
import { SideNav } from "@/components/sales-accelerator/side-nav";
import { cn } from "@/lib/utils";
import { fetchDirectory, type DirectoryCompany, type DirectoryContact } from "@/lib/api-client";
import { ScoreGauge, IshAvatar } from "@/design-system";
import { Building2, Users, MapPin, Mail, Phone, ExternalLink, Search } from "lucide-react";
import { toast } from "sonner";

type Tab = "companies" | "contacts";

const STATUS_COLORS: Record<string, string> = {
  scouted: "bg-ish-app text-ish-ink-soft",
  researched: "bg-blue-50 text-blue-700",
  draft_ready: "bg-ish-yellow/30 text-ish-ink",
  outreached: "bg-purple-50 text-purple-700",
  replied: "bg-ish-green/20 text-[#1f8050]",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
        STATUS_COLORS[status] ?? "bg-ish-app text-ish-ink-soft",
      )}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

function CompanyCard({
  company,
  isSelected,
  onSelect,
}: {
  company: DirectoryCompany;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full flex-col rounded-[18px] bg-white p-4 text-left transition-all",
        isSelected
          ? "ring-2 ring-blue-500 shadow-[var(--shadow-ish)]"
          : "shadow-[var(--shadow-ish-sm)] hover:shadow-[var(--shadow-ish)] hover:-translate-y-0.5",
      )}
    >
      <div className="mb-3 flex items-start justify-between">
        <div className="flex size-10 items-center justify-center rounded-[10px] bg-ish-app text-xl">
          🏢
        </div>
        <ScoreGauge score={company.giftScore} size="sm" background />
      </div>
      <div className="truncate text-[14px] font-bold text-ish-ink">{company.name}</div>
      <div className="mt-0.5 truncate text-[11px] text-ish-ink-soft">{company.industry}</div>
      <div className="mt-2 flex items-center gap-2 text-[11px] text-ish-ink-faint">
        <MapPin className="size-3" />
        {company.city}
        <span className="text-ish-border">·</span>
        <Users className="size-3" />
        {company.contacts.length} lead{company.contacts.length !== 1 ? "s" : ""}
      </div>
    </button>
  );
}

function ContactRow({ contact, showCompany }: { contact: DirectoryContact; showCompany?: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-[14px] border border-ish-border bg-white px-4 py-3 shadow-[var(--shadow-ish-sm)]">
      <IshAvatar name={contact.name} index={contact.name.charCodeAt(0)} size={36} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13.5px] font-bold text-ish-ink">{contact.name}</span>
          <StatusBadge status={contact.status} />
        </div>
        <div className="mt-0.5 text-[12px] text-ish-ink-soft">{contact.title}</div>
        {showCompany && (
          <div className="mt-0.5 text-[11px] font-medium text-ish-ink-faint">
            {contact.companyName} · {contact.companyCity}
          </div>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[11px] text-ish-ink-faint">
          {contact.email !== "—" && (
            <span className="flex items-center gap-1">
              <Mail className="size-3" />
              {contact.email}
            </span>
          )}
          {contact.phone && (
            <span className="flex items-center gap-1">
              <Phone className="size-3" />
              {contact.phone}
            </span>
          )}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <ScoreGauge score={contact.score} size="sm" />
        <Link
          href={`/?lead=${contact.leadId}`}
          className="flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:underline"
        >
          Open lead
          <ExternalLink className="size-3" />
        </Link>
      </div>
    </div>
  );
}

export function DirectoryApp() {
  const [tab, setTab] = useState<Tab>("companies");
  const [companies, setCompanies] = useState<DirectoryCompany[]>([]);
  const [contacts, setContacts] = useState<DirectoryContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const data = await fetchDirectory();
      setCompanies(data.companies);
      setContacts(data.contacts);
      if (data.companies[0] && !selectedCompanyId) {
        setSelectedCompanyId(data.companies[0].id);
      }
    } catch {
      toast.error("Could not load scout directory");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredCompanies = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.city.toLowerCase().includes(q) ||
        c.industry.toLowerCase().includes(q),
    );
  }, [companies, search]);

  const filteredContacts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.companyName.toLowerCase().includes(q) ||
        c.title.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q),
    );
  }, [contacts, search]);

  const selectedCompany = companies.find((c) => c.id === selectedCompanyId) ?? null;

  return (
    <AppShell>
      <TopBar />
      <div className="flex overflow-hidden" style={{ height: "calc(100vh - 116px)" }}>
        <SideNav />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {/* Single unified bar */}
          <div className="flex items-center gap-4 border-b border-ish-border bg-white px-5 py-2.5">
            {/* Title */}
            <div className="shrink-0">
              <span className="text-[14px] font-bold text-ish-ink">Scout Directory</span>
            </div>

            <div className="mx-1 h-5 w-px shrink-0 bg-ish-border" aria-hidden />

            {/* Tabs */}
            <SegmentedTabs
              value={tab}
              onChange={(value) => setTab(value as "companies" | "contacts")}
              items={[
                { value: "companies", label: "Companies", icon: <Building2 className="size-3.5" /> },
                { value: "contacts", label: "Lead Contacts", icon: <Users className="size-3.5" /> },
              ]}
            />

            {/* Search */}
            <div className="relative w-[220px] shrink-0">
              <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-ish-ink-faint" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={tab === "companies" ? "Search companies…" : "Search contacts…"}
                className="w-full rounded-full border border-ish-border bg-ish-app py-1.5 pl-9 pr-3 text-[12px] text-ish-ink outline-none focus:border-ish-ink-soft"
              />
            </div>

            {/* Count — pushed to right */}
            <div className="ml-auto shrink-0 text-[11.5px] font-semibold text-ish-ink-faint">
              {companies.length} companies · {contacts.length} contacts
            </div>
          </div>

          {/* Content */}
          <div className="min-h-0 flex-1 overflow-y-auto bg-ish-app">
            {loading ? (
              <div className="flex h-full items-center justify-center text-[13px] text-ish-ink-faint">
                <span className="mr-2 animate-spin">⟳</span> Loading directory…
              </div>
            ) : companies.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                <div className="text-4xl">📇</div>
                <div className="text-[14px] font-semibold text-ish-ink">No scout leads yet</div>
                <p className="max-w-sm text-[12px] text-ish-ink-soft">
                  Save contacts from the Scouting wizard and they will appear here as companies and lead contacts.
                </p>
                <Link
                  href="/scouting"
                  className="mt-2 rounded-xl bg-ish-black px-4 py-2 text-[12px] font-bold text-white shadow-[var(--shadow-ish)]"
                >
                  Go to Scouting
                </Link>
              </div>
            ) : tab === "companies" ? (
              <div key="companies" className="flex min-h-0 h-full animate-ish-tab-in">
                <div className="min-w-0 flex-1 overflow-y-auto p-5">
                  <div className="grid grid-cols-3 gap-3 xl:grid-cols-4">
                    {filteredCompanies.map((company) => (
                      <CompanyCard
                        key={company.id}
                        company={company}
                        isSelected={selectedCompanyId === company.id}
                        onSelect={() => setSelectedCompanyId(company.id)}
                      />
                    ))}
                  </div>
                  {filteredCompanies.length === 0 && (
                    <p className="py-10 text-center text-[13px] text-ish-ink-faint">No companies match your search.</p>
                  )}
                </div>

                <div className="w-[340px] shrink-0 overflow-y-auto border-l border-ish-border bg-white p-5">
                  {selectedCompany ? (
                    <>
                      <div className="mb-4">
                        <div className="text-[16px] font-bold text-ish-ink">{selectedCompany.name}</div>
                        <div className="mt-1 text-[12px] text-ish-ink-soft">
                          {selectedCompany.industry} · {selectedCompany.city}
                        </div>
                        <div className="mt-2 flex items-center gap-2 text-[11px] text-ish-ink-faint">
                          <Users className="size-3" />
                          {selectedCompany.employees} employees
                        </div>
                      </div>
                      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ish-ink-faint">
                        Lead contacts ({selectedCompany.contacts.length})
                      </div>
                      <div className="space-y-2">
                        {selectedCompany.contacts.map((c) => (
                          <ContactRow key={c.leadId} contact={{ ...c, companyName: selectedCompany.name, companyCity: selectedCompany.city, companyIndustry: selectedCompany.industry, companyId: selectedCompany.id }} />
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="text-[13px] text-ish-ink-faint">Select a company to view its lead contacts.</p>
                  )}
                </div>
              </div>
            ) : (
              <div key="contacts" className="space-y-2 p-5 animate-ish-tab-in">
                {filteredContacts.map((contact) => (
                  <ContactRow key={contact.leadId} contact={contact} showCompany />
                ))}
                {filteredContacts.length === 0 && (
                  <p className="py-10 text-center text-[13px] text-ish-ink-faint">No contacts match your search.</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

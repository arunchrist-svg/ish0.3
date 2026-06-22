"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { SegmentedTabs } from "@/design-system";
import { CompaniesGrid } from "@/components/scouting/companies-grid";
import { LeadsGrid } from "@/components/scouting/leads-grid";
import { PeopleList } from "@/components/scouting/people-list";
import { CompanyOverviewPanel } from "@/components/company/company-overview-panel";
import { fetchDirectory, type DirectoryCompany, type DirectoryContact } from "@/lib/api-client";
import { directoryCompanyToCard, directoryContactToPerson } from "@/lib/directory-mappers";
import { Building2, Users, Search } from "lucide-react";
import { toast } from "sonner";

type Tab = "companies" | "contacts";

const EMPTY_SET = new Set<string>();

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

  const companyCards = useMemo(
    () => filteredCompanies.map(directoryCompanyToCard),
    [filteredCompanies],
  );

  const contactPeople = useMemo(
    () => filteredContacts.map((c) => directoryContactToPerson(c)),
    [filteredContacts],
  );

  const contactMetaByLeadId = useMemo(() => {
    const map = new Map<string, { companyName: string; leadId: string }>();
    for (const contact of filteredContacts) {
      map.set(contact.leadId, { companyName: contact.companyName, leadId: contact.leadId });
    }
    return map;
  }, [filteredContacts]);

  const selectedCompany = companies.find((c) => c.id === selectedCompanyId) ?? null;

  const selectedCompanyDecisionMaker = useMemo(() => {
    if (!selectedCompany) return undefined;
    const key =
      selectedCompany.contacts.find((c) => c.isKeyDM) ?? selectedCompany.contacts[0];
    if (!key) return undefined;
    return key.title && key.title !== "—" ? `${key.name} — ${key.title}` : key.name;
  }, [selectedCompany]);
  const selectedCompanyDecisionMakerLeadId = useMemo(() => {
    if (!selectedCompany) return undefined;
    const key =
      selectedCompany.contacts.find((c) => c.isKeyDM) ?? selectedCompany.contacts[0];
    return key?.leadId;
  }, [selectedCompany]);

  const selectedCompanyPeople = useMemo(
    () =>
      selectedCompany
        ? selectedCompany.contacts.map((c) =>
            directoryContactToPerson({ ...c, companyId: selectedCompany.id }, selectedCompany.id, selectedCompany.name),
          )
        : [],
    [selectedCompany],
  );

  return (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex items-center gap-4 border-b border-ish-border bg-white px-5 py-2.5">
            <div className="shrink-0">
              <span className="text-[14px] font-bold text-ish-ink">Scout Directory</span>
            </div>

            <div className="mx-1 h-5 w-px shrink-0 bg-ish-border" aria-hidden />

            <SegmentedTabs
              value={tab}
              onChange={(value) => setTab(value as "companies" | "contacts")}
              items={[
                { value: "companies", label: "Companies", icon: <Building2 className="size-3.5" /> },
                { value: "contacts", label: "Lead Contacts", icon: <Users className="size-3.5" /> },
              ]}
            />

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

            <div className="ml-auto shrink-0 text-[11.5px] font-semibold text-ish-ink-faint">
              {companies.length} companies · {contacts.length} contacts
            </div>
          </div>

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
                <div className="min-w-0 flex-1 overflow-y-auto">
                  {companyCards.length === 0 ? (
                    <p className="py-10 text-center text-[13px] text-ish-ink-faint">No companies match your search.</p>
                  ) : (
                    <CompaniesGrid
                      companies={companyCards}
                      selectedIds={EMPTY_SET}
                      primaryId={selectedCompanyId}
                      onToggleSelect={() => {}}
                      onSetPrimary={setSelectedCompanyId}
                      selectable={false}
                    />
                  )}
                </div>

                <div className="w-[360px] shrink-0 overflow-y-auto border-l border-ish-border bg-white">
                  {selectedCompany ? (
                    <>
                      <CompanyOverviewPanel
                        name={selectedCompany.name}
                        city={selectedCompany.city}
                        giftScore={selectedCompany.giftScore}
                        industry={selectedCompany.industry}
                        initialOverview={selectedCompany.companyOverview}
                        overviewInput={{
                          name: selectedCompany.name,
                          city: selectedCompany.city,
                          industry: selectedCompany.industry,
                          employees: selectedCompany.employees !== "—" ? selectedCompany.employees : undefined,
                          domain: selectedCompany.domain,
                          website: selectedCompany.website,
                          giftScore: selectedCompany.giftScore,
                          accountId: selectedCompany.id,
                          decisionMakerHint: selectedCompanyDecisionMaker,
                        }}
                        decisionMakerLeadId={selectedCompanyDecisionMakerLeadId}
                      />
                      {selectedCompanyPeople.length > 0 ? (
                        <div className="border-t border-ish-border p-4">
                          <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-ish-ink-faint">
                            Lead Contacts ({selectedCompany.contacts.length})
                          </div>
                          <PeopleList
                            people={selectedCompanyPeople}
                            selectedIds={EMPTY_SET}
                            primaryId={null}
                            onToggleSelect={() => {}}
                            onSetPrimary={() => {}}
                            selectable={false}
                          />
                        </div>
                      ) : (
                        <p className="border-t border-ish-border p-5 text-[13px] text-ish-ink-faint">
                          No lead contacts for this company.
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="p-5 text-[13px] text-ish-ink-faint">Select a company to view its lead contacts.</p>
                  )}
                </div>
              </div>
            ) : (
              <div key="contacts" className="animate-ish-tab-in">
                {contactPeople.length === 0 ? (
                  <p className="py-10 text-center text-[13px] text-ish-ink-faint">No contacts match your search.</p>
                ) : (
                  <LeadsGrid
                    people={contactPeople}
                    selectedIds={EMPTY_SET}
                    primaryId={null}
                    onToggleSelect={() => {}}
                    onSetPrimary={() => {}}
                    onContact={() => {}}
                    onBookmark={() => {}}
                    selectable={false}
                    getCompanyName={(person) => contactMetaByLeadId.get(person.id)?.companyName}
                    getDirectoryLeadId={(person) => contactMetaByLeadId.get(person.id)?.leadId}
                  />
                )}
              </div>
            )}
          </div>
        </div>
  );
}

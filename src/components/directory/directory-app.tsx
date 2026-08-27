"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppPageHeader, MobileHeader, SegmentedTabs } from "@/design-system";
import { useIsMobileLayout } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";
import { CompaniesGrid } from "@/components/scouting/companies-grid";
import { LeadsGrid } from "@/components/scouting/leads-grid";
import { PeopleList } from "@/components/scouting/people-list";
import { CompanyOverviewPanel } from "@/components/company/company-overview-panel";
import { FacetFilterBar } from "@/components/filters/facet-filter-bar";
import { fetchDirectory, fetchDirectoryContacts, type DirectoryCompany, type DirectoryContact } from "@/lib/api-client";
import { subscribeCrmRecordsRefresh } from "@/lib/crm-refresh";
import { directoryCompanyToCard, directoryContactToPerson } from "@/lib/directory-mappers";
import {
  ACCOUNT_COMPANY_PANEL_STORAGE_KEY,
  ACCOUNT_COMPANY_QUICK,
  ACCOUNT_COMPANY_QUICK_STORAGE_KEY,
  ACCOUNT_COMPANY_SORT_OPTIONS,
  ACCOUNT_COMPANY_SORT_STORAGE_KEY,
  ACCOUNT_CONTACT_PANEL_STORAGE_KEY,
  ACCOUNT_CONTACT_QUICK,
  ACCOUNT_CONTACT_QUICK_STORAGE_KEY,
  ACCOUNT_CONTACT_SORT_OPTIONS,
  ACCOUNT_CONTACT_SORT_STORAGE_KEY,
  applyAccountCompanyView,
  applyAccountContactView,
  buildAccountCompanyPanelGroups,
  buildAccountContactPanelGroups,
  collectAccountCities,
  isAccountCompanyPanelId,
  isAccountContactPanelId,
  parseStoredQuick,
  parseStoredSet,
  parseStoredSort,
  type AccountCompanyQuickId,
  type AccountCompanySort,
  type AccountContactQuickId,
  type AccountContactSort,
} from "@/lib/directory/account-filters";
import { Building2, Users, Search } from "lucide-react";
import { toast } from "sonner";
import { AccountsFetchLeads } from "@/components/directory/accounts-fetch-leads";

type Tab = "companies" | "contacts";

const EMPTY_SET = new Set<string>();

const COMPANY_QUICK_IDS = ACCOUNT_COMPANY_QUICK.map((q) => q.id);
const COMPANY_SORT_IDS = ACCOUNT_COMPANY_SORT_OPTIONS.map((o) => o.value);
const CONTACT_QUICK_IDS = ACCOUNT_CONTACT_QUICK.map((q) => q.id);
const CONTACT_SORT_IDS = ACCOUNT_CONTACT_SORT_OPTIONS.map((o) => o.value);

function readLocal(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocal(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

export function DirectoryApp() {
  const isMobileLayout = useIsMobileLayout();
  const [tab, setTab] = useState<Tab>("companies");
  const [companies, setCompanies] = useState<DirectoryCompany[]>([]);
  const [contacts, setContacts] = useState<DirectoryContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);

  const [companyQuick, setCompanyQuick] = useState<AccountCompanyQuickId | null>(null);
  const [companyPanel, setCompanyPanel] = useState<Set<string>>(new Set());
  const [companySort, setCompanySort] = useState<AccountCompanySort>("date_newest");
  const [contactQuick, setContactQuick] = useState<AccountContactQuickId | null>(null);
  const [contactPanel, setContactPanel] = useState<Set<string>>(new Set());
  const [contactSort, setContactSort] = useState<AccountContactSort>("date_newest");

  useEffect(() => {
    setCompanyQuick(parseStoredQuick(readLocal(ACCOUNT_COMPANY_QUICK_STORAGE_KEY), COMPANY_QUICK_IDS));
    setCompanyPanel(parseStoredSet(readLocal(ACCOUNT_COMPANY_PANEL_STORAGE_KEY), isAccountCompanyPanelId));
    setCompanySort(
      parseStoredSort(readLocal(ACCOUNT_COMPANY_SORT_STORAGE_KEY), COMPANY_SORT_IDS, "date_newest"),
    );
    setContactQuick(parseStoredQuick(readLocal(ACCOUNT_CONTACT_QUICK_STORAGE_KEY), CONTACT_QUICK_IDS));
    setContactPanel(parseStoredSet(readLocal(ACCOUNT_CONTACT_PANEL_STORAGE_KEY), isAccountContactPanelId));
    setContactSort(
      parseStoredSort(readLocal(ACCOUNT_CONTACT_SORT_STORAGE_KEY), CONTACT_SORT_IDS, "date_newest"),
    );
  }, []);

  useEffect(() => {
    writeLocal(ACCOUNT_COMPANY_QUICK_STORAGE_KEY, companyQuick ?? "");
  }, [companyQuick]);
  useEffect(() => {
    writeLocal(ACCOUNT_COMPANY_PANEL_STORAGE_KEY, JSON.stringify([...companyPanel]));
  }, [companyPanel]);
  useEffect(() => {
    writeLocal(ACCOUNT_COMPANY_SORT_STORAGE_KEY, companySort);
  }, [companySort]);
  useEffect(() => {
    writeLocal(ACCOUNT_CONTACT_QUICK_STORAGE_KEY, contactQuick ?? "");
  }, [contactQuick]);
  useEffect(() => {
    writeLocal(ACCOUNT_CONTACT_PANEL_STORAGE_KEY, JSON.stringify([...contactPanel]));
  }, [contactPanel]);
  useEffect(() => {
    writeLocal(ACCOUNT_CONTACT_SORT_STORAGE_KEY, contactSort);
  }, [contactSort]);

  const [nextCompanyCursor, setNextCompanyCursor] = useState<string | null>(null);
  const [nextContactCursor, setNextContactCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [companiesPage, contactsPage] = await Promise.all([
        fetchDirectory({ limit: 50 }),
        fetchDirectoryContacts({ limit: 50 }),
      ]);
      setCompanies(companiesPage.companies);
      setContacts(contactsPage.contacts);
      setNextCompanyCursor(companiesPage.nextCursor ?? null);
      setNextContactCursor(contactsPage.nextCursor ?? null);
      if (companiesPage.companies[0] && !selectedCompanyId) {
        setSelectedCompanyId(companiesPage.companies[0].id);
      }
    } catch {
      toast.error("Could not load scout directory");
    } finally {
      setLoading(false);
    }
  }

  async function loadMoreCompanies() {
    if (!nextCompanyCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchDirectory({ limit: 50, cursor: nextCompanyCursor });
      setCompanies((prev) => [...prev, ...page.companies]);
      setNextCompanyCursor(page.nextCursor ?? null);
    } catch {
      toast.error("Could not load more companies");
    } finally {
      setLoadingMore(false);
    }
  }

  async function loadMoreContacts() {
    if (!nextContactCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchDirectoryContacts({ limit: 50, cursor: nextContactCursor });
      setContacts((prev) => [...prev, ...page.contacts]);
      setNextContactCursor(page.nextCursor ?? null);
    } catch {
      toast.error("Could not load more contacts");
    } finally {
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    load();
    return subscribeCrmRecordsRefresh(() => {
      void load();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredCompanies = useMemo(
    () =>
      applyAccountCompanyView(companies, {
        query: search,
        quick: companyQuick,
        panel: companyPanel,
        sort: companySort,
      }),
    [companies, search, companyQuick, companyPanel, companySort],
  );

  const filteredContacts = useMemo(
    () =>
      applyAccountContactView(contacts, {
        query: search,
        quick: contactQuick,
        panel: contactPanel,
        sort: contactSort,
      }),
    [contacts, search, contactQuick, contactPanel, contactSort],
  );

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

  const selectedCompany =
    filteredCompanies.find((c) => c.id === selectedCompanyId) ??
    companies.find((c) => c.id === selectedCompanyId) ??
    null;

  useEffect(() => {
    if (!filteredCompanies.length) {
      setSelectedCompanyId(null);
      return;
    }
    if (!selectedCompanyId || !filteredCompanies.some((c) => c.id === selectedCompanyId)) {
      setSelectedCompanyId(filteredCompanies[0]!.id);
    }
  }, [filteredCompanies, selectedCompanyId]);

  const selectedCompanyDecisionMaker = useMemo(() => {
    if (!selectedCompany) return undefined;
    const key =
      selectedCompany.contacts.find((c) => c.isKeyDM) ?? selectedCompany.contacts[0];
    if (!key) return undefined;
    return key.title && key.title !== "-" && key.title !== "—" && key.title !== "Unknown"
      ? `${key.name}: ${key.title}`
      : key.name;
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

  const companyCities = useMemo(() => collectAccountCities(companies), [companies]);
  const contactCities = useMemo(
    () => collectAccountCities(contacts.map((c) => ({ city: c.companyCity }))),
    [contacts],
  );
  const companyPanelGroups = useMemo(
    () => buildAccountCompanyPanelGroups(companyCities),
    [companyCities],
  );
  const contactPanelGroups = useMemo(
    () => buildAccountContactPanelGroups(contactCities),
    [contactCities],
  );

  const filterBar =
    tab === "companies" ? (
      <FacetFilterBar
        ariaLabel="Filter accounts"
        emptyHint="Choose how to view companies"
        quick={companyQuick}
        panel={companyPanel}
        sort={companySort}
        quickOptions={ACCOUNT_COMPANY_QUICK}
        panelGroups={companyPanelGroups}
        sortOptions={ACCOUNT_COMPANY_SORT_OPTIONS}
        onQuickChange={(next) => setCompanyQuick(next as AccountCompanyQuickId | null)}
        onPanelChange={setCompanyPanel}
        onSortChange={(next) => setCompanySort(next as AccountCompanySort)}
      />
    ) : (
      <FacetFilterBar
        ariaLabel="Filter account contacts"
        emptyHint="Choose how to view lead contacts"
        quick={contactQuick}
        panel={contactPanel}
        sort={contactSort}
        quickOptions={ACCOUNT_CONTACT_QUICK}
        panelGroups={contactPanelGroups}
        sortOptions={ACCOUNT_CONTACT_SORT_OPTIONS}
        onQuickChange={(next) => setContactQuick(next as AccountContactQuickId | null)}
        onPanelChange={setContactPanel}
        onSortChange={(next) => setContactSort(next as AccountContactSort)}
      />
    );

  return (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <AppPageHeader
            icon={Building2}
            title="Accounts"
            actions={
              <>
                <SegmentedTabs
                  value={tab}
                  onChange={(value) => setTab(value as "companies" | "contacts")}
                  items={[
                    { value: "companies", label: "Companies", icon: <Building2 className="size-3.5" /> },
                    { value: "contacts", label: "Lead Contacts", icon: <Users className="size-3.5" /> },
                  ]}
                />
                <div className="relative w-[220px] shrink-0">
                  <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-brand-ink-faint" />
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={tab === "companies" ? "Search companies…" : "Search contacts…"}
                    className="w-full rounded-full border border-brand-border/70 bg-white/70 py-2 pl-9 pr-3 text-[12px] text-brand-ink outline-none backdrop-blur-sm transition-colors focus:border-[rgba(var(--brand-stratus-blue-rgb),0.45)] focus:bg-white"
                  />
                </div>
                {filterBar}
              </>
            }
          />

          <div className="min-h-0 flex-1 overflow-y-auto bg-transparent">
            {loading ? (
              <div className="flex h-full items-center justify-center text-[13px] text-brand-ink-faint">
                <span className="mr-2 animate-spin">⟳</span> Loading directory…
              </div>
            ) : companies.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                <div className="text-4xl">📇</div>
                <div className="text-[14px] font-semibold text-brand-ink">No saved accounts yet</div>
                <p className="max-w-sm text-[12px] text-brand-ink-soft">
                  Save companies or contacts from Scouting and they will appear here. Companies saved without leads show up too.
                </p>
                <Link
                  href="/scouting"
                  className="mt-2 rounded-xl bg-brand-black px-4 py-2 text-[12px] font-bold text-white shadow-[var(--shadow-brand)]"
                >
                  Go to Scouting
                </Link>
              </div>
            ) : tab === "companies" ? (
              <div key="companies" className={cn("flex min-h-0 h-full animate-brand-tab-in", isMobileLayout && selectedCompany && "relative")}>
                <div className="min-w-0 flex-1 overflow-y-auto">
                  {companyCards.length === 0 ? (
                    <p className="py-10 text-center text-[13px] text-brand-ink-faint">No companies match your filters.</p>
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
                  {nextCompanyCursor ? (
                    <div className="flex justify-center py-4">
                      <button
                        type="button"
                        onClick={() => void loadMoreCompanies()}
                        disabled={loadingMore}
                        className="rounded-full border border-brand-border/70 bg-white px-4 py-2 text-[12px] font-semibold text-brand-ink disabled:opacity-50"
                      >
                        {loadingMore ? "Loading…" : "Load more companies"}
                      </button>
                    </div>
                  ) : null}
                </div>

                <div className="fixed inset-0 z-40 flex flex-col overflow-y-auto border-l border-brand-border bg-white lg:relative lg:inset-auto lg:z-auto lg:w-[360px] lg:shrink-0">
                  {selectedCompany ? (
                    <>
                      {isMobileLayout ? (
                        <MobileHeader title={selectedCompany.name} showBack onBack={() => setSelectedCompanyId(null)} largeTitle={false} className="lg:hidden" />
                      ) : null}
                      <CompanyOverviewPanel
                        name={selectedCompany.name}
                        city={selectedCompany.city}
                        fitScore={selectedCompany.fitScore}
                        domain={selectedCompany.domain}
                        website={selectedCompany.website}
                        industry={selectedCompany.industry}
                        initialOverview={selectedCompany.companyOverview}
                        overviewInput={{
                          name: selectedCompany.name,
                          city: selectedCompany.city,
                          industry: selectedCompany.industry,
                          employees:
                            selectedCompany.employees !== "-" &&
                            selectedCompany.employees !== "—" &&
                            selectedCompany.employees !== "Unknown"
                              ? selectedCompany.employees
                              : undefined,
                          domain: selectedCompany.domain,
                          website: selectedCompany.website,
                          fitScore: selectedCompany.fitScore,
                          accountId: selectedCompany.id,
                          decisionMakerHint: selectedCompanyDecisionMaker,
                        }}
                        decisionMakerLeadId={selectedCompanyDecisionMakerLeadId}
                      />
                      <AccountsFetchLeads company={selectedCompany} onSaved={() => void load()} />
                      {selectedCompanyPeople.length > 0 ? (
                        <div className="border-t border-brand-border p-4">
                          <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-brand-ink-faint">
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
                        <p className="border-t border-brand-border p-5 text-[13px] text-brand-ink-faint">
                          No saved lead contacts yet. Use Fetch Leads above to find people, then Add
                          Leads.
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="p-5 text-[13px] text-brand-ink-faint">Select a company to view its lead contacts.</p>
                  )}
                </div>
              </div>
            ) : (
              <div key="contacts" className="animate-brand-tab-in">
                {contactPeople.length === 0 ? (
                  <p className="py-10 text-center text-[13px] text-brand-ink-faint">No contacts match your filters.</p>
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
                {nextContactCursor ? (
                  <div className="flex justify-center py-4">
                    <button
                      type="button"
                      onClick={() => void loadMoreContacts()}
                      disabled={loadingMore}
                      className="rounded-full border border-brand-border/70 bg-white px-4 py-2 text-[12px] font-semibold text-brand-ink disabled:opacity-50"
                    >
                      {loadingMore ? "Loading…" : "Load more contacts"}
                    </button>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>
  );
}

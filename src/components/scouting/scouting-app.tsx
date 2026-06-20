"use client";

import { useState, useMemo, useCallback } from "react";
import { AppShell } from "@/design-system";
import { TopBar } from "@/components/sales-accelerator/top-bar";
import { SideNav } from "@/components/sales-accelerator/side-nav";
import { ScoutingWizard } from "./scouting-wizard";
import { ScoutingControlBar } from "./scouting-control-bar";
import { CompaniesGrid } from "./companies-grid";
import { CompanyDetailPanel } from "./company-detail-panel";
import { LeadsGrid } from "./leads-grid";
import { PersonDetailPanel } from "./person-detail-panel";
import { scoutCompanies, scoutPeople, scoutSave } from "@/lib/api-client";
import type { ScoutCompanyResult, ScoutPersonResult, DataMode } from "@/lib/enrichment/types";
import { toast } from "sonner";

type View = "companies" | "people";

// Adapters so existing grid/detail components keep their shape
function toCompanyShape(c: ScoutCompanyResult, idx: number) {
  return {
    id: c.externalId ?? `c-${idx}`,
    logo: c.logo ?? "🏢",
    name: c.name,
    type: c.industry ?? "Corporate",
    city: c.city ?? "",
    industry: c.industry ?? "",
    employees: c.employees ?? "—",
    revenue: "—",
    founded: 0,
    giftScore: c.giftScore ?? 60,
    giftBudget: c.giftBudget ?? "—",
    pastGifting: (c.pastGifting ?? []) as { year: string; occasion: string; items: string; perPerson: string }[],
    intelligenceNotes: c.intelNotes ?? "",
    _raw: c,
  };
}

function toPersonShape(p: ScoutPersonResult, companyId: string, idx: number) {
  return {
    id: p.externalId ?? `p-${idx}`,
    companyId,
    name: p.name,
    title: p.title ?? "—",
    department: p.department ?? "—",
    seniority: p.seniority ?? "—",
    isKeyDecisionMaker: p.isKeyDM ?? false,
    matchScore: p.matchScore ?? 55,
    engagementSignals: p.engagementSignals ?? [],
    linkedIn: p.linkedIn ?? "",
    email: p.email ? maskEmail(p.email) : "—",
    phone: p.phone ? maskPhone(p.phone) : "—",
    bio: p.bio ?? "",
    emailStatus: p.emailStatus,
    _raw: p,
  };
}

function maskEmail(e: string) {
  const [local, domain] = e.split("@");
  if (!domain) return e;
  return `${local.slice(0, 2)}***@${domain}`;
}

function maskPhone(p: string) {
  return p.replace(/\d(?=\d{4})/g, "*");
}

export function ScoutingApp() {
  const [view, setView] = useState<View>("companies");
  const [cities, setCities] = useState<string[]>(["Bangalore"]);
  const [industries, setIndustries] = useState<string[]>([]);
  const [dataMode, setDataMode] = useState<DataMode>(
    (process.env.NEXT_PUBLIC_DEFAULT_DATA_MODE as DataMode) ?? "free",
  );

  const [companies, setCompanies] = useState<ReturnType<typeof toCompanyShape>[]>([]);
  const [people, setPeople] = useState<ReturnType<typeof toPersonShape>[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(false);
  const [loadingPeople, setLoadingPeople] = useState(false);
  const [saving, setSaving] = useState(false);

  const [selectedCompanyIds, setSelectedCompanyIds] = useState<Set<string>>(new Set());
  const [primaryCompanyId, setPrimaryCompanyId] = useState<string | null>(null);
  const [selectedPersonIds, setSelectedPersonIds] = useState<Set<string>>(new Set());
  const [primaryPersonId, setPrimaryPersonId] = useState<string | null>(null);

  const primaryCompany = useMemo(
    () => companies.find((c) => c.id === primaryCompanyId) ?? null,
    [companies, primaryCompanyId],
  );
  const primaryPerson = useMemo(
    () => people.find((p) => p.id === primaryPersonId) ?? null,
    [people, primaryPersonId],
  );
  const primaryPersonIndex = useMemo(
    () => people.findIndex((p) => p.id === primaryPersonId),
    [people, primaryPersonId],
  );

  const currentStep: 1 | 2 | 3 = view === "companies" ? 1 : selectedPersonIds.size > 0 ? 3 : 2;

  const loadCompanies = useCallback(
    async (nextCities: string[], nextIndustries: string[]) => {
      setLoadingCompanies(true);
      try {
        const results = await scoutCompanies({ cities: nextCities, industries: nextIndustries, dataMode });
        setCompanies(results.map((c, i) => toCompanyShape(c, i)));
      } catch (e) {
        toast.error("Could not load companies. Check API keys.");
        console.error(e);
      } finally {
        setLoadingCompanies(false);
      }
    },
    [dataMode],
  );

  function toggleCity(city: string) {
    setCities((prev) => {
      const next = prev.includes(city)
        ? prev.length > 1 ? prev.filter((c) => c !== city) : prev
        : [...prev, city];
      loadCompanies(next, industries);
      return next;
    });
  }

  function toggleIndustry(ind: string) {
    setIndustries((prev) => {
      const next = prev.includes(ind) ? prev.filter((i) => i !== ind) : [...prev, ind];
      loadCompanies(cities, next);
      return next;
    });
  }

  function toggleCompany(id: string) {
    setSelectedCompanyIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function setCompanyAsPrimary(id: string) {
    setPrimaryCompanyId(id);
    setSelectedCompanyIds((prev) => (prev.has(id) ? prev : new Set([...prev, id])));
  }

  function togglePerson(id: string) {
    setSelectedPersonIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function setPersonAsPrimary(id: string) {
    setPrimaryPersonId(id);
    setSelectedPersonIds((prev) => (prev.has(id) ? prev : new Set([...prev, id])));
  }

  async function handleFetchLeads() {
    const selected = companies.filter((c) => selectedCompanyIds.has(c.id));
    if (!selected.length) return;

    setView("people");
    setLoadingPeople(true);
    setPeople([]);
    setSelectedPersonIds(new Set());
    setPrimaryPersonId(null);

    try {
      const allPeople: ReturnType<typeof toPersonShape>[] = [];
      for (const company of selected) {
        const results = await scoutPeople({
          companyName: company.name,
          companyDomain: company._raw.domain,
          dataMode,
        });
        const shaped = results.map((p, i) =>
          toPersonShape(p, company.id, allPeople.length + i),
        );
        allPeople.push(...shaped);
      }
      setPeople(allPeople);
      if (allPeople[0]) setPrimaryPersonId(allPeople[0].id);
    } catch (e) {
      toast.error("Could not load people. Check API keys.");
      console.error(e);
    } finally {
      setLoadingPeople(false);
    }
  }

  async function handleAddLeads() {
    const selectedPeople = people.filter((p) => selectedPersonIds.has(p.id));
    if (!selectedPeople.length) return;

    setSaving(true);
    let totalSaved = 0;
    let totalSkipped = 0;

    try {
      // Group by companyId
      const byCompany = new Map<string, typeof selectedPeople>();
      for (const p of selectedPeople) {
        const g = byCompany.get(p.companyId) ?? [];
        g.push(p);
        byCompany.set(p.companyId, g);
      }

      for (const [companyId, persons] of byCompany) {
        const company = companies.find((c) => c.id === companyId);
        if (!company) continue;
        const result = await scoutSave({
          people: persons.map((p) => p._raw),
          company: company._raw,
        });
        totalSaved += result.saved.length;
        totalSkipped += result.skipped.length;
      }

      if (totalSaved > 0) {
        toast.success(`${totalSaved} lead${totalSaved > 1 ? "s" : ""} saved — check Leads queue`);
      }
      if (totalSkipped > 0) {
        toast.info(`${totalSkipped} skipped (no email or failed filter)`);
      }
    } catch (e) {
      toast.error("Save failed. Check logs.");
      console.error(e);
    } finally {
      setSaving(false);
    }
  }

  function handleBackToCompanies() {
    setView("companies");
    setSelectedPersonIds(new Set());
    setPrimaryPersonId(null);
  }

  // Load companies on first mount
  const [initialized, setInitialized] = useState(false);
  if (!initialized) {
    setInitialized(true);
    loadCompanies(cities, industries);
  }

  return (
    <AppShell>
      <TopBar />
      <div className="flex overflow-hidden" style={{ height: "calc(100vh - 116px)" }}>
        <SideNav />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <ScoutingWizard
            currentStep={currentStep}
            companiesCount={selectedCompanyIds.size}
            leadsCount={people.length}
          />

          <ScoutingControlBar
            view={view}
            cities={cities}
            industries={industries}
            dataMode={dataMode}
            selectedCount={view === "companies" ? selectedCompanyIds.size : selectedPersonIds.size}
            onCityToggle={toggleCity}
            onIndustryToggle={toggleIndustry}
            onDataModeChange={setDataMode}
            onFetchLeads={handleFetchLeads}
            onAddLeads={handleAddLeads}
            onScoutMore={() => setView("companies")}
            saving={saving}
          />

          <div className="flex min-h-0 flex-1 overflow-hidden">
            <div className="min-w-0 flex-1 overflow-y-auto bg-ish-app">
              {view === "companies" ? (
                loadingCompanies ? (
                  <div className="flex h-full items-center justify-center gap-2 text-[13px] text-ish-ink-faint">
                    <span className="animate-spin">⟳</span> Discovering companies…
                  </div>
                ) : companies.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-[13px] text-ish-ink-faint">
                    No companies found. Try different filters.
                  </div>
                ) : (
                  <CompaniesGrid
                    companies={companies}
                    selectedIds={selectedCompanyIds}
                    primaryId={primaryCompanyId}
                    onToggleSelect={toggleCompany}
                    onSetPrimary={setCompanyAsPrimary}
                  />
                )
              ) : (
                <div className="p-2">
                  <button
                    type="button"
                    onClick={handleBackToCompanies}
                    className="mb-2 ml-3 flex items-center gap-1.5 text-[12px] font-semibold text-ish-ink-soft hover:text-ish-ink"
                  >
                    ← Back to Companies
                  </button>
                  <div className="mb-2 ml-3 text-[11px] font-semibold uppercase tracking-wide text-ish-ink-faint">
                    {people.length} Decision-Makers · {selectedCompanyIds.size}{" "}
                    {selectedCompanyIds.size === 1 ? "Company" : "Companies"}
                  </div>
                  {loadingPeople ? (
                    <div className="py-12 text-center text-[13px] text-ish-ink-faint">
                      <span className="animate-spin inline-block mr-2">⟳</span> Finding decision-makers…
                    </div>
                  ) : people.length === 0 ? (
                    <div className="py-10 text-center text-[13px] text-ish-ink-faint">
                      No people found for the selected companies.
                    </div>
                  ) : (
                    <LeadsGrid
                      people={people}
                      selectedIds={selectedPersonIds}
                      primaryId={primaryPersonId}
                      onToggleSelect={togglePerson}
                      onSetPrimary={setPersonAsPrimary}
                      onContact={(p) => toast.info(`Opening contact for ${p.name}`)}
                      onBookmark={(p) => toast.info(`Bookmarked ${p.name}`)}
                    />
                  )}
                </div>
              )}
            </div>

            <div className="w-[320px] shrink-0 overflow-y-auto border-l border-ish-border bg-white">
              {view === "companies" && primaryCompany ? (
                <CompanyDetailPanel company={primaryCompany} />
              ) : view === "people" && primaryPerson ? (
                <PersonDetailPanel person={primaryPerson} index={primaryPersonIndex} />
              ) : (
                <div className="flex h-full items-center justify-center p-8 text-center text-[13px] text-ish-ink-faint">
                  {view === "companies"
                    ? "Click a company tile to see details"
                    : "Click a lead card to see their profile"}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

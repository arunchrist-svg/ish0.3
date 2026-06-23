"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
// import { ScoutingProgressBar } from "./scouting-progress-bar";
import { ScoutingToolbar, type ScoutMode } from "./scouting-toolbar";
import { DiscoveringLoader } from "./discovering-loader";
import { CompaniesGrid } from "./companies-grid";
import { CompanyDetailPanel } from "./company-detail-panel";
import { LeadsGrid } from "./leads-grid";
import { PersonDetailPanel } from "./person-detail-panel";
import { scoutCompanies, scoutPeople, scoutSave } from "@/lib/api-client";
import type { ScoutCompanyResult, ScoutPersonResult, DataMode } from "@/lib/enrichment/types";
import { toast } from "sonner";
import { normalizeLinkedInUrl, cn } from "@/lib/utils";
import { SCOUT_SENIORITY, SCOUT_DEPARTMENTS } from "@/lib/scouting-data";

type View = "companies" | "people";

type CompanyShape = ReturnType<typeof toCompanyShape>;


function resolveCompanyDomain(raw: ScoutCompanyResult): string | undefined {
  if (raw.domain) return raw.domain;
  if (!raw.website) return undefined;
  try {
    return new URL(raw.website.startsWith("http") ? raw.website : `https://${raw.website}`).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}


function noticeKey(msg: string): string {
  if (/quota|usage limit/i.test(msg)) return "tavily-quota";
  if (/google places/i.test(msg)) return "google-places-fallback";
  if (/no directory listings/i.test(msg)) return "no-directory";
  return msg.slice(0, 120);
}


function pickPeopleNotice(messages: string[]): { headline: string; detail: string } {
  const unique = [...new Set(messages.filter(Boolean))];
  if (!unique.length) {
    return {
      headline: "No decision-makers found for the selected companies.",
      detail:
        "We search LinkedIn via Tavily. Try companies with websites or well-known brands (e.g. Bosch, Infosys).",
    };
  }

  const joined = unique.join(" ");
  const primary = pickPrimaryNotice(unique) ?? unique[0];

  if (/tavily_api_key.*missing|tavily api key.*missing|tavily_api_key not set/i.test(joined)) {
    return {
      headline: "People search needs a Tavily API key.",
      detail: "Add TAVILY_API_KEY in .env.local, restart the dev server, then try again.",
    };
  }

  if (/all tavily keys exhausted/i.test(joined)) {
    return {
      headline: "All Tavily keys are exhausted.",
      detail:
        "Add TAVILY_API_KEY_2 in .env.local, switch Data Mode to Apollo, or wait for your monthly Tavily credit reset.",
    };
  }

  if (/quota|usage limit|exhausted|people search needs tavily credits/i.test(joined)) {
    return {
      headline: "Tavily credits exhausted for people search.",
      detail: primary,
    };
  }

  if (/switched to backup key/i.test(joined)) {
    return {
      headline: "No decision-makers found for the selected companies.",
      detail: `${primary} Try companies with websites or larger brands.`,
    };
  }

  if (/website|linkedin profiles|no decision-makers found/i.test(joined)) {
    return {
      headline: "No decision-makers found for the selected companies.",
      detail: primary,
    };
  }

  return {
    headline: "No decision-makers found for the selected companies.",
    detail: primary,
  };
}

function pickPrimaryNotice(messages: string[]): string | null {
  const unique = [...new Set(messages.filter(Boolean))];
  if (!unique.length) return null;
  return (
    unique.find((m) => /quota|usage limit/i.test(m)) ??
    unique.find((m) => /missing|rejected|failed|exhausted/i.test(m)) ??
    unique[0]
  );
}

function companyKey(c: ScoutCompanyResult): string {
  return (c.externalId ?? c.name).toLowerCase().replace(/\s+/g, "-");
}

function toCompanyShape(c: ScoutCompanyResult) {
  return {
    id: companyKey(c),
    logo: c.logo ?? "🏢",
    domain: c.domain,
    name: c.name,
    type: c.industry ?? "Corporate",
    city: c.city ?? "",
    industry: c.industry ?? "",
    employees: c.employees ?? "—",
    revenue: c.revenue ?? "—",
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
    id: p.externalId ?? `p-${companyId}-${idx}`,
    companyId,
    name: p.name,
    title: p.title ?? "—",
    department: p.department ?? "—",
    seniority: p.seniority ?? "—",
    isKeyDecisionMaker: p.isKeyDM ?? false,
    matchScore: p.matchScore ?? 55,
    engagementSignals: p.engagementSignals ?? [],
    linkedIn: normalizeLinkedInUrl(p.linkedIn) ?? "",
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

function mergeCompanies(existing: CompanyShape[], incoming: CompanyShape[]): CompanyShape[] {
  const seen = new Set(existing.map((c) => c.id));
  const merged = [...existing];
  for (const c of incoming) {
    if (!seen.has(c.id)) {
      merged.push(c);
      seen.add(c.id);
    }
  }
  return merged;
}

/* ─────────────────────────────────────────────
   Role Picker Modal
───────────────────────────────────────────── */

function RolePickerModal({
  onConfirm,
  onSkip,
}: {
  onConfirm: (seniority: string[], departments: string[]) => void;
  onSkip: () => void;
}) {
  const [chosenSeniority, setChosenSeniority] = useState<string[]>([]);
  const [chosenDepts, setChosenDepts] = useState<string[]>([]);

  function toggleSeniority(s: string) {
    setChosenSeniority((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    );
  }
  function toggleDept(d: string) {
    setChosenDepts((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d],
    );
  }

  const hasSelection = chosenSeniority.length > 0 || chosenDepts.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
      <div className="mx-4 w-full max-w-md rounded-2xl border border-ish-border bg-white shadow-[var(--shadow-ish-float)]">
        {/* Header */}
        <div className="border-b border-ish-border px-6 py-4">
          <p className="text-[15px] font-bold text-ish-ink">Who are you looking for?</p>
          <p className="mt-0.5 text-[12px] text-ish-ink-soft">
            Select role filters to target the right decision-makers.
          </p>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-5 px-6 py-5">
          {/* Seniority */}
          <div>
            <p className="mb-2 text-[9.5px] font-bold uppercase tracking-widest text-ish-ink-faint">
              Seniority
            </p>
            <div className="flex flex-wrap gap-2">
              {SCOUT_SENIORITY.map((s) => {
                const active = chosenSeniority.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleSeniority(s)}
                    className={cn(
                      "rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition-all duration-150",
                      active
                        ? "bg-ish-ink text-white shadow-[var(--shadow-ish)]"
                        : "bg-ish-app text-ish-ink-soft hover:bg-ish-border hover:text-ish-ink",
                    )}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Department */}
          <div>
            <p className="mb-2 text-[9.5px] font-bold uppercase tracking-widest text-ish-ink-faint">
              Department
            </p>
            <div className="flex flex-wrap gap-2">
              {SCOUT_DEPARTMENTS.map((d) => {
                const active = chosenDepts.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggleDept(d)}
                    className={cn(
                      "rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition-all duration-150",
                      active
                        ? "bg-ish-yellow text-ish-ink shadow-[var(--shadow-ish-yellow-sm)]"
                        : "bg-ish-app text-ish-ink-soft hover:bg-ish-border hover:text-ish-ink",
                    )}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-ish-border px-6 py-4">
          <button
            type="button"
            onClick={onSkip}
            className="text-[12px] font-semibold text-ish-ink-faint hover:text-ish-ink"
          >
            Skip — find all roles
          </button>
          <button
            type="button"
            onClick={() => onConfirm(chosenSeniority, chosenDepts)}
            disabled={!hasSelection}
            className={cn(
              "flex items-center gap-1.5 rounded-xl px-5 py-2 text-[12.5px] font-bold transition-all duration-150",
              hasSelection
                ? "bg-ish-green text-white shadow-[var(--shadow-ish)] hover:opacity-90"
                : "cursor-not-allowed bg-ish-app text-ish-ink-faint",
            )}
          >
            Find Decision-Makers →
          </button>
        </div>
      </div>
    </div>
  );
}

export function ScoutingApp() {
  const [view, setView] = useState<View>("companies");
  const [cities, setCities] = useState<string[]>(["Bengaluru"]);
  const [industries, setIndustries] = useState<string[]>([]);
  const [seniority, setSeniority] = useState<string[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [dataMode, setDataMode] = useState<DataMode>("free");
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [scoutCompaniesLimit, setScoutCompaniesLimit] = useState(1);
  const [scoutLeadsLimit, setScoutLeadsLimit] = useState(1);

  const [companies, setCompanies] = useState<CompanyShape[]>([]);
  const [people, setPeople] = useState<ReturnType<typeof toPersonShape>[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingPeople, setLoadingPeople] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);
  const [fetchMessage, setFetchMessage] = useState<string | null>(null);
  const [discoveryNotice, setDiscoveryNotice] = useState<string | null>(null);
  const [peopleNotice, setPeopleNotice] = useState<{ headline: string; detail: string } | null>(null);
  const [fetchSeed, setFetchSeed] = useState(0);
  const shownNoticesRef = useRef(new Set<string>());

  const [selectedCompanyIds, setSelectedCompanyIds] = useState<Set<string>>(new Set());
  const [primaryCompanyId, setPrimaryCompanyId] = useState<string | null>(null);
  const [selectedPersonIds, setSelectedPersonIds] = useState<Set<string>>(new Set());
  const [primaryPersonId, setPrimaryPersonId] = useState<string | null>(null);
  const [existingContactNames, setExistingContactNames] = useState<Set<string>>(new Set());
  const [crmLeadIdsByKey, setCrmLeadIdsByKey] = useState<Map<string, string>>(new Map());
  const [scoutMode, setScoutMode] = useState<ScoutMode>("autopilot");
  const [companySearchQuery, setCompanySearchQuery] = useState("");
  const [showRolePicker, setShowRolePicker] = useState(false);
  const [pendingFetchIds, setPendingFetchIds] = useState<Set<string> | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const leadsRes = await fetch("/api/leads");
        const leadsData = await leadsRes.json();
        if (!leadsData.leads) return;
        const map = new Map<string, string>();
        for (const lead of leadsData.leads as { id: string; name: string; company: string }[]) {
          map.set(`${lead.company.toLowerCase()}|${lead.name.toLowerCase()}`, lead.id);
          map.set(lead.name.toLowerCase(), lead.id);
        }
        setCrmLeadIdsByKey(map);
        setExistingContactNames(new Set((leadsData.leads as { name: string }[]).map((l) => l.name.toLowerCase())));
      } catch {
        // non-critical
      }
    })();
  }, []);

  const primaryCompany = useMemo(
    () => companies.find((c) => c.id === primaryCompanyId) ?? null,
    [companies, primaryCompanyId],
  );

  const primaryCompanyDecisionMaker = useMemo(() => {
    if (!primaryCompany) return undefined;
    const companyPeople = people.filter((p) => p.companyId === primaryCompany.id);
    const key = companyPeople.find((p) => p.isKeyDecisionMaker) ?? companyPeople[0];
    if (!key) return undefined;
    return key.title && key.title !== "—" ? `${key.name} — ${key.title}` : key.name;
  }, [primaryCompany, people]);
  const primaryCompanyDecisionMakerLeadId = useMemo(() => {
    if (!primaryCompany) return undefined;
    const companyPeople = people.filter((p) => p.companyId === primaryCompany.id);
    const key = companyPeople.find((p) => p.isKeyDecisionMaker) ?? companyPeople[0];
    if (!key) return undefined;
    const companyKey = `${primaryCompany.name.toLowerCase()}|${key.name.toLowerCase()}`;
    return crmLeadIdsByKey.get(companyKey) ?? crmLeadIdsByKey.get(key.name.toLowerCase());
  }, [primaryCompany, people, crmLeadIdsByKey]);

  const primaryPerson = useMemo(
    () => people.find((p) => p.id === primaryPersonId) ?? null,
    [people, primaryPersonId],
  );
  const primaryPersonIndex = useMemo(
    () => people.findIndex((p) => p.id === primaryPersonId),
    [people, primaryPersonId],
  );

  const selectablePeople = useMemo(
    () => people.filter((p) => !existingContactNames.has(p.name.toLowerCase())),
    [people, existingContactNames],
  );

  const allCompaniesSelected =
    companies.length > 0 && companies.every((c) => selectedCompanyIds.has(c.id));

  const allPeopleSelected =
    selectablePeople.length > 0 && selectablePeople.every((p) => selectedPersonIds.has(p.id));

  // const currentStep: 1 | 2 | 3 = view === "companies" ? 1 : selectedPersonIds.size > 0 ? 3 : 2;

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data: { dataMode?: DataMode; scoutCompaniesLimit?: number; scoutLeadsLimit?: number }) => {
        if (data.dataMode) setDataMode(data.dataMode);
        if (typeof data.scoutCompaniesLimit === "number") setScoutCompaniesLimit(data.scoutCompaniesLimit);
        if (typeof data.scoutLeadsLimit === "number") setScoutLeadsLimit(data.scoutLeadsLimit);
      })
      .catch(() => {
        const fallback = (process.env.NEXT_PUBLIC_DEFAULT_DATA_MODE as DataMode) ?? "free";
        setDataMode(fallback);
      })
      .finally(() => setSettingsLoaded(true));
  }, []);

  useEffect(() => {
    function onScoutVolumeUpdated(e: Event) {
      const detail = (e as CustomEvent<{ scoutCompaniesLimit?: number; scoutLeadsLimit?: number }>).detail;
      if (typeof detail?.scoutCompaniesLimit === "number") setScoutCompaniesLimit(detail.scoutCompaniesLimit);
      if (typeof detail?.scoutLeadsLimit === "number") setScoutLeadsLimit(detail.scoutLeadsLimit);
    }
    window.addEventListener("scout-volume-updated", onScoutVolumeUpdated);
    return () => window.removeEventListener("scout-volume-updated", onScoutVolumeUpdated);
  }, []);


  const loadCompanies = useCallback(
    async (
      nextCities: string[],
      nextIndustries: string[],
      options?: { append?: boolean; skipInternal?: boolean; excludeNames?: string[]; seed?: number; forceMainLoader?: boolean; companyName?: string },
    ) => {
      const append = options?.append ?? false;
      const setLoading = append && !options?.forceMainLoader ? setLoadingMore : setLoadingCompanies;
      setLoading(true);

      try {
        const excludeNames =
          options?.excludeNames ?? (append ? companies.map((c) => c.name) : []);
        const seed = options?.seed ?? fetchSeed;
        const response = await scoutCompanies({
          cities: nextCities,
          industries: nextIndustries,
          dataMode,
          excludeNames,
          skipInternal: options?.skipInternal ?? append,
          fetchSeed: seed,
          limit: scoutCompaniesLimit,
          ...(options?.companyName ? { companyName: options.companyName } : {}),
        });

        const shaped = response.companies.map((c) => toCompanyShape(c));
        setCompanies((prev) => (append ? mergeCompanies(prev, shaped) : shaped));
        setHasMore(response.hasMore);
        if (!append && shaped[0]) setPrimaryCompanyId(shaped[0].id);

        if (append && !shaped.length && !response.errors?.length) {
          toast.info("No additional companies found for these filters. Try other cities or industries.");
        }

        const allNotices = [...(response.errors ?? []), ...(response.warnings ?? [])];
        const primaryNotice = pickPrimaryNotice(allNotices);

        if (response.warnings?.length) {
          setDiscoveryNotice(response.warnings.join(" "));
        } else {
          setDiscoveryNotice(null);
        }

        if (primaryNotice && /quota|usage limit|exhausted|missing|failed/i.test(primaryNotice)) {
          const key = noticeKey(primaryNotice);
          if (!shownNoticesRef.current.has(key)) {
            shownNoticesRef.current.add(key);
            toast.error(primaryNotice);
          }
          setFetchMessage(primaryNotice);
        } else {
          setFetchMessage(null);
        }

        if (!append && !shaped.length && !primaryNotice) {
          const helpfulWarning =
            response.warnings?.find((w) =>
              /verified city|directory|parse|no companies matched|listings found/i.test(w),
            ) ?? response.warnings?.[0];
          setFetchMessage(
            helpfulWarning ??
              "No companies matched the current filters. Try different cities or leave industries unselected.",
          );
        }

        window.dispatchEvent(new Event("tavily-usage-refresh"));
      } catch (e) {
        window.dispatchEvent(new Event("tavily-usage-refresh"));
        const msg = e instanceof Error ? e.message : "Could not load companies.";
        setFetchMessage(msg);
        toast.error(msg.includes("API") ? msg : `Could not load companies: ${msg}`);
        console.error(e);
      } finally {
        setLoading(false);
        if (!append) setHasFetched(true);
      }
    },
    [dataMode, companies, fetchSeed, scoutCompaniesLimit],
  );

  function handleCitiesChange(nextCities: string[]) {
    setCities(nextCities);
  }


  function toggleIndustry(ind: string) {
    setIndustries((prev) =>
      prev.includes(ind) ? prev.filter((i) => i !== ind) : [...prev, ind],
    );
  }

  function toggleSeniority(s: string) {
    setSeniority((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    );
  }

  function toggleDepartment(d: string) {
    setDepartments((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d],
    );
  }

  function handleFetchNewCompanies() {
    if (!settingsLoaded) {
      toast.error("Still loading settings — try again in a moment.");
      return;
    }
    if (!cities.length) {
      toast.error("Select at least one city");
      return;
    }
    const nextSeed = fetchSeed + 1;
    setFetchSeed(nextSeed);
    setSelectedCompanyIds(new Set());
    setView("companies");
    setPeople([]);
    setSelectedPersonIds(new Set());
    setPrimaryPersonId(null);
    setPeopleNotice(null);
    setDiscoveryNotice(null);
    setFetchMessage(null);

    // Fresh scout with current filters — Load More handles appending more results.
    loadCompanies(cities, industries, {
      append: false,
      skipInternal: true,
      excludeNames: [],
      seed: nextSeed,
    });
  }


  function handleRefresh() {
    setSelectedCompanyIds(new Set());
    setFetchSeed(0);
    setDiscoveryNotice(null);
    loadCompanies(cities, industries, { append: false, skipInternal: false, excludeNames: [], seed: 0 });
  }

  function handleScoutModeChange(mode: ScoutMode) {
    setScoutMode(mode);
    setCompanySearchQuery("");
    setCompanies([]);
    setHasFetched(false);
    setFetchMessage(null);
    setDiscoveryNotice(null);
    setSelectedCompanyIds(new Set());
    setPrimaryCompanyId(null);
    if (view !== "companies") {
      setView("companies");
      setPeople([]);
      setSelectedPersonIds(new Set());
      setPrimaryPersonId(null);
    }
  }

  function handleSearchByName() {
    const query = companySearchQuery.trim();
    if (!query) {
      toast.error("Enter a company name to search");
      return;
    }
    if (!cities.length) {
      toast.error("Select at least one city");
      return;
    }
    setSelectedCompanyIds(new Set());
    setFetchSeed(0);
    setDiscoveryNotice(null);
    loadCompanies(cities, industries, {
      append: false,
      skipInternal: false,
      excludeNames: [],
      seed: 0,
      companyName: query,
    });
  }

  function handleLoadMore() {
    const nextSeed = fetchSeed + 1;
    setFetchSeed(nextSeed);
    loadCompanies(cities, industries, {
      append: true,
      skipInternal: true,
      excludeNames: companies.map((c) => c.name),
      seed: nextSeed,
    });
  }

  function handleScoutMore() {
    setView("companies");
    setSelectedPersonIds(new Set());
    setPrimaryPersonId(null);
    const nextSeed = fetchSeed + 1;
    setFetchSeed(nextSeed);
    loadCompanies(cities, industries, {
      append: true,
      skipInternal: true,
      excludeNames: companies.map((c) => c.name),
      seed: nextSeed,
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
  }

  function togglePerson(id: string) {
    const person = people.find((p) => p.id === id);
    if (person && existingContactNames.has(person.name.toLowerCase())) return;
    setSelectedPersonIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function setPersonAsPrimary(id: string) {
    setPrimaryPersonId(id);
  }

  function selectAllCompanies() {
    setSelectedCompanyIds(new Set(companies.map((c) => c.id)));
  }

  function deselectAllCompanies() {
    setSelectedCompanyIds(new Set());
  }

  function selectAllPeople() {
    const selectable = people.filter((p) => !existingContactNames.has(p.name.toLowerCase()));
    setSelectedPersonIds(new Set(selectable.map((p) => p.id)));
  }

  function deselectAllPeople() {
    setSelectedPersonIds(new Set());
  }

  function handleFetchLeads() {
    const selected = companies.filter((c) => selectedCompanyIds.has(c.id));
    if (!selected.length) return;

    // If no roles selected, show role picker first
    if (seniority.length === 0 && departments.length === 0) {
      setPendingFetchIds(new Set(selected.map((c) => c.id)));
      setShowRolePicker(true);
      return;
    }

    void runFetchLeads(selected, seniority, departments);
  }

  function handleRolePickerConfirm(chosenSeniority: string[], chosenDepartments: string[]) {
    setSeniority(chosenSeniority);
    setDepartments(chosenDepartments);
    setShowRolePicker(false);
    const ids = pendingFetchIds ?? selectedCompanyIds;
    const selected = companies.filter((c) => ids.has(c.id));
    setPendingFetchIds(null);
    void runFetchLeads(selected, chosenSeniority, chosenDepartments);
  }

  async function runFetchLeads(selected: CompanyShape[], activeSeniority: string[], activeDepartments: string[]) {
    setView("people");
    setLoadingPeople(true);
    setPeople([]);
    setPeopleNotice(null);
    setSelectedPersonIds(new Set());
    setPrimaryPersonId(null);

    try {
      const allPeople: ReturnType<typeof toPersonShape>[] = [];
      const peopleWarnings: string[] = [];
      for (const company of selected) {
        const { people: results, warnings, errors } = await scoutPeople({
          companyName: company.name,
          companyDomain: resolveCompanyDomain(company._raw),
          companyWebsite: company._raw.website,
          dataMode,
          limit: scoutLeadsLimit,
          seniority: activeSeniority,
          departments: activeDepartments,
        });
        peopleWarnings.push(...(warnings ?? []), ...(errors ?? []));
        const shaped = results.map((p, i) =>
          toPersonShape(p, company.id, allPeople.length + i),
        );
        allPeople.push(...shaped);
      }
      setPeople(allPeople);

      // Check which fetched people are already in CRM
      try {
        const leadsRes = await fetch("/api/leads");
        const leadsData = await leadsRes.json();
        if (leadsData.leads) {
          const map = new Map<string, string>();
          for (const lead of leadsData.leads as { id: string; name: string; company: string }[]) {
            map.set(`${lead.company.toLowerCase()}|${lead.name.toLowerCase()}`, lead.id);
            map.set(lead.name.toLowerCase(), lead.id);
          }
          setCrmLeadIdsByKey(map);
          setExistingContactNames(new Set((leadsData.leads as { id: string; name: string }[]).map((l) => l.name.toLowerCase())));
        }
      } catch {
        // non-critical
      }

      if (allPeople[0]) {
        setPrimaryPersonId(allPeople[0].id);
        setPeopleNotice(null);
      } else {
        const notice = pickPeopleNotice(peopleWarnings);
        setPeopleNotice(notice);
        const switchMsg = peopleWarnings.find((w) => /switched to backup key/i.test(w));
        if (switchMsg) {
          const key = noticeKey(switchMsg);
          if (!shownNoticesRef.current.has(key)) {
            shownNoticesRef.current.add(key);
            toast.info(switchMsg);
          }
        }
        const errorMsg = pickPrimaryNotice(peopleWarnings);
        if (errorMsg && /missing|exhausted|quota|usage limit|people search needs tavily/i.test(errorMsg)) {
          const key = noticeKey(errorMsg);
          if (!shownNoticesRef.current.has(key)) {
            shownNoticesRef.current.add(key);
            toast.error(errorMsg);
          }
        } else if (!peopleWarnings.length) {
          toast.info(notice.detail);
        }
      }
    } catch (e) {
      toast.error("Could not load people. Check API keys.");
      console.error(e);
    } finally {
      window.dispatchEvent(new Event("tavily-usage-refresh"));
      setLoadingPeople(false);
    }
  }

  async function handleAddLeads() {
    const selectedPeople = people.filter((p) => selectedPersonIds.has(p.id));
    if (!selectedPeople.length) return;

    setSaving(true);
    let totalSaved = 0;
    const allSkipped: { name: string; reason: string }[] = [];

    try {
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
        allSkipped.push(...result.skipped);
      }

      if (totalSaved > 0) {
        toast.success(`${totalSaved} lead${totalSaved > 1 ? "s" : ""} saved — check Leads queue`);
        // mark saved people so they show as already-added if user returns
        const savedNames = selectedPeople.map((p) => p.name.toLowerCase());
        setExistingContactNames((prev) => new Set([...prev, ...savedNames]));
        void (async () => {
          try {
            const leadsRes = await fetch("/api/leads");
            const leadsData = await leadsRes.json();
            if (!leadsData.leads) return;
            const map = new Map<string, string>();
            for (const lead of leadsData.leads as { id: string; name: string; company: string }[]) {
              map.set(`${lead.company.toLowerCase()}|${lead.name.toLowerCase()}`, lead.id);
              map.set(lead.name.toLowerCase(), lead.id);
            }
            setCrmLeadIdsByKey(map);
          } catch {
            // non-critical
          }
        })();
      }
      if (allSkipped.length > 0) {
        const detail = allSkipped
          .slice(0, 3)
          .map((s) => `${s.name}: ${s.reason}`)
          .join("; ");
        const suffix = allSkipped.length > 3 ? ` (+${allSkipped.length - 3} more)` : "";
        toast.info(`${allSkipped.length} skipped — ${detail}${suffix}`);
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

  return (
    <>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {/* ScoutingProgressBar — stepper hidden for now
          <ScoutingProgressBar
            currentStep={currentStep}
            companiesCount={selectedCompanyIds.size}
            leadsCount={people.length}
          />
          */}

          <ScoutingToolbar
            view={view}
            cities={cities}
            industries={industries}
            seniority={seniority}
            departments={departments}
            selectedCount={view === "companies" ? selectedCompanyIds.size : selectedPersonIds.size}
            settingsLoaded={settingsLoaded}
            scoutCompaniesLimit={scoutCompaniesLimit}
            scoutLeadsLimit={scoutLeadsLimit}
            loadingCompanies={loadingCompanies}
            loadingMore={loadingMore}
            saving={saving}
            scoutMode={scoutMode}
            companySearchQuery={companySearchQuery}
            onCitiesChange={handleCitiesChange}
            onIndustryToggle={toggleIndustry}
            onSeniorityToggle={toggleSeniority}
            onDepartmentToggle={toggleDepartment}
            onFetchNewCompanies={handleFetchNewCompanies}
            onFetchLeads={handleFetchLeads}
            onAddLeads={handleAddLeads}
            onScoutMore={handleScoutMore}
            onLoadMore={handleLoadMore}
            onRefresh={handleRefresh}
            onScoutModeChange={handleScoutModeChange}
            onCompanySearchQueryChange={setCompanySearchQuery}
            onSearchByName={handleSearchByName}
          />

          <div className="flex min-h-0 flex-1 overflow-hidden">
            <div className="min-w-0 flex-1 overflow-y-auto bg-white/40">
              {view === "companies" ? (
                loadingCompanies ? (
                  <DiscoveringLoader
                    hints={[
                      cities.length
                        ? `Scanning ${cities.join(", ")}`
                        : "Scanning company directories",
                      industries.length
                        ? `Filtering ${industries.join(", ")}`
                        : "Matching all industries",
                      "Ranking by gift potential",
                    ]}
                  />
                ) : companies.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-[13px] text-ish-ink-faint">
                    {!hasFetched ? (
                      <>
                        {scoutMode === "search" ? (
                          <>
                            <p>Choose a city and industry, type a company name, then click <strong className="text-ish-ink">Search</strong>.</p>
                            <p className="text-[12px]">Only matching companies will be shown — no broad scouting.</p>
                          </>
                        ) : (
                          <>
                            <p>Select cities and industries, then click <strong className="text-ish-ink">Scout</strong>.</p>
                            <p className="text-[12px]">Tip: leave industries unselected for broader results across your chosen cities.</p>
                          </>
                        )}
                      </>
                    ) : (
                      <>
                        <p>{fetchMessage ?? (scoutMode === "search" ? "No companies matched that name." : "No companies found for the current filters.")}</p>
                        <p className="text-[12px]">
                          {fetchMessage?.includes("API") || fetchMessage?.includes("missing")
                            ? "Check .env.local (TAVILY_API_KEY, LLM API key) or Settings, then try again."
                            : scoutMode === "search"
                              ? "Try a different spelling or check the company name."
                              : "Try different cities or industries, then fetch again."}
                        </p>
                      </>
                    )}
                  </div>
                ) : (
                  <>
                    {discoveryNotice ? (
                      <div className="mx-5 mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] leading-snug text-amber-950">
                        {discoveryNotice}
                      </div>
                    ) : null}
                    <div className="flex items-center justify-between gap-3 px-5 py-2">
                      <div className="min-w-0 text-[11px] font-semibold uppercase tracking-wide text-ish-ink-faint">
                        {companies.length} {scoutMode === "search" ? "result" : "compan"}{companies.length === 1 ? (scoutMode === "search" ? "" : "y") : (scoutMode === "search" ? "s" : "ies")}
                        {scoutMode === "search" && companySearchQuery ? ` · "${companySearchQuery}"` : ""}
                        {" · "}{cities.join(", ")}
                        {industries.length > 0 ? ` · ${industries.join(", ")}` : scoutMode === "autopilot" ? " · all industries" : ""}
                        {selectedCompanyIds.size > 0 ? ` · ${selectedCompanyIds.size} selected` : ""}
                      </div>
                      <button
                        type="button"
                        onClick={allCompaniesSelected ? deselectAllCompanies : selectAllCompanies}
                        className="shrink-0 rounded-full border border-ish-border bg-white px-3 py-1 text-[11px] font-semibold text-ish-ink shadow-[var(--shadow-ish-sm)] transition-colors hover:bg-ish-app"
                      >
                        {allCompaniesSelected ? "Deselect all" : "Select all"}
                      </button>
                    </div>
                    <CompaniesGrid
                      companies={companies}
                      selectedIds={selectedCompanyIds}
                      primaryId={primaryCompanyId}
                      onToggleSelect={toggleCompany}
                      onSetPrimary={setCompanyAsPrimary}
                    />
                    {hasMore && (
                      <div className="flex justify-center py-4">
                        <button
                          type="button"
                          onClick={handleLoadMore}
                          disabled={loadingMore}
                          className="rounded-xl border border-ish-border bg-white px-5 py-2 text-[12px] font-semibold text-ish-ink shadow-[var(--shadow-ish-sm)] hover:bg-ish-app disabled:opacity-50"
                        >
                          {loadingMore ? "Loading…" : "Load More Companies"}
                        </button>
                      </div>
                    )}
                  </>
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
                  <div className="mb-2 flex items-center justify-between gap-3 px-3">
                    <div className="min-w-0 text-[11px] font-semibold uppercase tracking-wide text-ish-ink-faint">
                      {people.length} Decision-Makers · {selectedCompanyIds.size}{" "}
                      {selectedCompanyIds.size === 1 ? "Company" : "Companies"}
                      {selectedPersonIds.size > 0 ? ` · ${selectedPersonIds.size} selected` : ""}
                    </div>
                    {people.length > 0 && !loadingPeople ? (
                      <button
                        type="button"
                        onClick={allPeopleSelected ? deselectAllPeople : selectAllPeople}
                        className="shrink-0 rounded-full border border-ish-border bg-white px-3 py-1 text-[11px] font-semibold text-ish-ink shadow-[var(--shadow-ish-sm)] transition-colors hover:bg-ish-app"
                      >
                        {allPeopleSelected ? "Deselect all" : "Select all"}
                      </button>
                    ) : null}
                  </div>
                  {loadingPeople ? (
                    <DiscoveringLoader
                      message="Finding decision-makers"
                      hints={[
                        "Identifying key contacts",
                        "Matching seniority & titles",
                        "Checking engagement signals",
                      ]}
                      compact
                    />
                  ) : people.length === 0 ? (
                    <div className="px-6 py-10 text-center text-[13px] text-ish-ink-faint">
                      <p>{peopleNotice?.headline ?? "No decision-makers found for the selected companies."}</p>
                      <p className="mt-2 text-[12px]">{peopleNotice?.detail ?? "We search LinkedIn via Tavily. Try companies with websites or well-known brands."}</p>
                    </div>
                  ) : (
                    <LeadsGrid
                      people={people}
                      selectedIds={selectedPersonIds}
                      primaryId={primaryPersonId}
                      existingNames={existingContactNames}
                      onToggleSelect={togglePerson}
                      onSetPrimary={setPersonAsPrimary}
                      onContact={(p) => toast.info(`Opening contact for ${p.name}`)}
                      onBookmark={(p) => toast.info(`Bookmarked ${p.name}`)}
                    />
                  )}
                </div>
              )}
            </div>

            <div className="w-[360px] shrink-0 overflow-y-auto border-l border-ish-border bg-white">
              {view === "companies" && primaryCompany ? (
                <CompanyDetailPanel company={primaryCompany} decisionMakerHint={primaryCompanyDecisionMaker} decisionMakerLeadId={primaryCompanyDecisionMakerLeadId} />
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
      {showRolePicker && (
        <RolePickerModal
          onConfirm={handleRolePickerConfirm}
          onSkip={() => {
            setShowRolePicker(false);
            const ids = pendingFetchIds ?? selectedCompanyIds;
            const selected = companies.filter((c) => ids.has(c.id));
            setPendingFetchIds(null);
            void runFetchLeads(selected, [], []);
          }}
        />
      )}
    </>
  );
}

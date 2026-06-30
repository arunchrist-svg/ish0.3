"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
// import { ScoutingProgressBar } from "./scouting-progress-bar";
import { ScoutingToolbar, type ScoutMode } from "./scouting-toolbar";
import { DiscoveringLoader } from "./discovering-loader";
import { SavingLeadsLoader } from "./saving-leads-loader";
import { CompaniesGrid } from "./companies-grid";
import { CompanyDetailPanel } from "./company-detail-panel";
import { LeadsGrid } from "./leads-grid";
import { PersonDetailPanel } from "./person-detail-panel";
import { scoutCompanies, scoutPeople, scoutPeopleBatchStream, scoutSave, scoutExactSearch } from "@/lib/api-client";
import { mapWithConcurrency } from "@/lib/async";
import type { ScoutCompanyResult, ScoutPersonResult, DataMode } from "@/lib/enrichment/types";
import { toast } from "sonner";
import { normalizeLinkedInUrl, cn } from "@/lib/utils";
import {
  ActionBar,
  BottomSheet,
  EmptyState,
  MobileHeader,
  MobilePageLayout,
} from "@/design-system";
import { useIsMobileLayout } from "@/hooks/use-media-query";
import { Compass, MapPin, MoreVertical, Search, Users } from "lucide-react";
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
      headline: "People search is temporarily unavailable.",
      detail: "Try again later or contact support if this persists.",
    };
  }

  if (/all tavily keys exhausted/i.test(joined)) {
    return {
      headline: "Search capacity is temporarily limited.",
      detail: "Try a smaller scout batch, switch data mode in Settings, or try again later.",
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

function isUsableExternalId(id?: string | null): boolean {
  if (!id?.trim()) return false;
  const normalized = id.trim().toLowerCase();
  return normalized !== "unknown" && normalized !== "undefined" && normalized !== "null";
}

function slugifyKey(...parts: (string | number | undefined | null)[]): string {
  return parts
    .filter((part) => part !== undefined && part !== null && String(part).trim() !== "")
    .map((part) => String(part).toLowerCase().trim())
    .join("-")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function companyKey(c: ScoutCompanyResult, index = 0): string {
  if (isUsableExternalId(c.externalId)) {
    return slugifyKey(c.externalId);
  }
  const base = slugifyKey(c.name, c.city, c.domain);
  if (base && base !== "unknown") return base;
  return `company-${slugifyKey(c.name, c.city) || "item"}-${index}`;
}

function toCompanyShape(c: ScoutCompanyResult, index = 0) {
  return {
    id: companyKey(c, index),
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
  const id = isUsableExternalId(p.externalId)
    ? p.externalId!.trim()
    : slugifyKey("p", companyId, p.name, idx) || `p-${companyId}-${idx}`;

  return {
    id,
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

function dedupeCompanyShapes(shapes: CompanyShape[]): CompanyShape[] {
  const seen = new Map<string, number>();
  return shapes.map((shape) => {
    const count = seen.get(shape.id) ?? 0;
    seen.set(shape.id, count + 1);
    if (count === 0) return shape;
    return { ...shape, id: `${shape.id}-${count}` };
  });
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


function ScoutCompaniesEmpty({
  hasFetched,
  scoutMode,
  fetchMessage,
}: {
  hasFetched: boolean;
  scoutMode: ScoutMode;
  fetchMessage: string | null;
}) {
  if (!hasFetched) {
    return (
      <div className="mx-4 mt-6 rounded-[24px] border border-ish-border/50 bg-white/80 px-6 py-12 text-center shadow-ish backdrop-blur-xl lg:mx-5 lg:mt-8">
        <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl bg-ish-yellow-gradient shadow-ish-yellow-sm">
          <Compass className="size-7 text-ish-black" />
        </div>
        <EmptyState
          title={scoutMode === "search" ? "Search by company name" : "Ready to scout"}
          description={
            scoutMode === "search"
              ? "Pick a city, type a company name, then tap Search."
              : "Pick a city, then tap Scout now. Leave industry open for broader results."
          }
          className="py-0"
        />
      </div>
    );
  }

  return (
    <div className="mx-4 mt-6 rounded-[24px] border border-ish-border/50 bg-white/80 px-6 py-12 text-center shadow-ish backdrop-blur-xl lg:mx-5 lg:mt-8">
      <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl bg-ish-canvas text-ish-ink-soft">
        <MapPin className="size-7" />
      </div>
      <EmptyState
        title={fetchMessage ?? (scoutMode === "search" ? "No matches found" : "No companies found")}
        description={
          fetchMessage?.includes("API") || fetchMessage?.includes("missing")
            ? "Try again in a few minutes or adjust settings."
            : scoutMode === "search"
              ? "Try a different spelling or company name."
              : "Try different cities or leave industry unselected."
        }
        className="py-0"
      />
    </div>
  );
}

function ScoutPeopleEmpty({
  headline,
  detail,
}: {
  headline: string;
  detail: string;
}) {
  return (
    <div className="mx-4 mt-4 rounded-[24px] border border-ish-border/50 bg-white/80 px-6 py-12 text-center shadow-ish backdrop-blur-xl">
      <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl bg-ish-canvas text-ish-ink-soft">
        <Users className="size-7" />
      </div>
      <EmptyState title={headline} description={detail} className="py-0" />
    </div>
  );
}


export function ScoutingApp() {
  const isMobileLayout = useIsMobileLayout();
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
  const [fetchProgress, setFetchProgress] = useState({ done: 0, total: 0 });
  const [saving, setSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState({ done: 0, total: 0 });
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
  const [filtersExpanded, setFiltersExpanded] = useState(true);
  const [overflowOpen, setOverflowOpen] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const leadsRes = await fetch("/api/leads/dedupe");
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

        const shaped = dedupeCompanyShapes(response.companies.map((c, i) => toCompanyShape(c, i)));
        setCompanies((prev) => (append ? mergeCompanies(prev, shaped) : shaped));
        setHasMore(response.hasMore);
        if (!append) {
          setSelectedCompanyIds(new Set(shaped.map((c) => c.id)));
          setPrimaryCompanyId(null);
        } else if (shaped.length) {
          setSelectedCompanyIds((prev) => {
            const next = new Set(prev);
            shaped.forEach((c) => next.add(c.id));
            return next;
          });
        }
        if (!append && shaped[0] && typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches) {
          setPrimaryCompanyId(shaped[0].id);
        }

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

  async function handleSearchByName() {
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

    const isExactQuery = /linkedin\.com|\.[a-z]{2,}$/i.test(query);
    if (isExactQuery) {
      setLoadingCompanies(true);
      try {
        const exact = await scoutExactSearch({ query, city: cities[0] }) as {
          primaryCompany?: { name: string; domain?: string; website?: string; industry?: string; city?: string; employees?: string; dataSource: string };
          primaryPerson?: { name: string; title?: string; matchScore?: number; email?: string; emailStatus?: string; dataSource: string };
          confidence?: number;
          warnings?: string[];
        };
        if (exact.primaryCompany) {
          const shaped = toCompanyShape(exact.primaryCompany);
          setCompanies([shaped]);
          if (exact.warnings?.length) toast.message(exact.warnings[0]);
          if (exact.primaryPerson) {
            const person = toPersonShape(
              { ...exact.primaryPerson, emailStatus: (exact.primaryPerson.emailStatus ?? "missing") as ScoutPersonResult["emailStatus"], dataSource: exact.primaryPerson.dataSource ?? "exact" },
              shaped.id,
              0,
            );
            setPeople([person]);
            setPrimaryPersonId(person.id);
          }
          setView("people");
          return;
        }
      } catch {
        toast.error("Exact search failed, falling back to name search");
      } finally {
        setLoadingCompanies(false);
      }
    }

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

  function applyLeadsDedupe(leadsData: { leads?: { id: string; name: string; company: string }[] }) {
    if (!leadsData.leads) return;
    const map = new Map<string, string>();
    for (const lead of leadsData.leads) {
      map.set(`${lead.company.toLowerCase()}|${lead.name.toLowerCase()}`, lead.id);
      map.set(lead.name.toLowerCase(), lead.id);
    }
    setCrmLeadIdsByKey(map);
    setExistingContactNames(new Set(leadsData.leads.map((l) => l.name.toLowerCase())));
  }

  async function fetchLeadsParallel(
    selected: CompanyShape[],
    activeSeniority: string[],
    activeDepartments: string[],
    allPeople: ReturnType<typeof toPersonShape>[],
    peopleWarnings: string[],
  ) {
    let doneCount = 0;
    await mapWithConcurrency(selected, 5, async (company) => {
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
      const shaped = results.map((p, j) => toPersonShape(p, company.id, j));
      allPeople.push(...shaped);
      doneCount += 1;
      setFetchProgress({ done: doneCount, total: selected.length });
      setPeople((prev) => [...prev, ...shaped]);
    });
  }

  async function runFetchLeads(selected: CompanyShape[], activeSeniority: string[], activeDepartments: string[]) {
    setView("people");
    setLoadingPeople(true);
    setFetchProgress({ done: 0, total: selected.length });
    setPeople([]);
    setPeopleNotice(null);
    setSelectedPersonIds(new Set());
    setPrimaryPersonId(null);

    const leadsDedupePromise = fetch("/api/leads/dedupe")
      .then((res) => res.json())
      .catch(() => null);

    try {
      const allPeople: ReturnType<typeof toPersonShape>[] = [];
      const peopleWarnings: string[] = [];

      if (selected.length > 1) {
        try {
          let doneCount = 0;
          await scoutPeopleBatchStream(
            {
              companies: selected.map((c) => ({
                id: c.id,
                name: c.name,
                domain: resolveCompanyDomain(c._raw),
                website: c._raw.website,
              })),
              dataMode,
              limit: scoutLeadsLimit,
              seniority: activeSeniority,
              departments: activeDepartments,
            },
            (companyId, batchResult) => {
              const company = selected.find((c) => c.id === companyId);
              if (!company) return;
              peopleWarnings.push(...(batchResult.warnings ?? []), ...(batchResult.errors ?? []));
              const shaped = batchResult.people.map((p, j) => toPersonShape(p, company.id, j));
              allPeople.push(...shaped);
              doneCount += 1;
              setFetchProgress({ done: doneCount, total: selected.length });
              setPeople((prev) => [...prev, ...shaped]);
            },
          );
        } catch (batchErr) {
          console.warn("[scouting] batch fetch failed, falling back to parallel singles:", batchErr);
          await fetchLeadsParallel(selected, activeSeniority, activeDepartments, allPeople, peopleWarnings);
        }
      } else {
        await fetchLeadsParallel(selected, activeSeniority, activeDepartments, allPeople, peopleWarnings);
      }

      void leadsDedupePromise.then((leadsData) => {
        if (leadsData) applyLeadsDedupe(leadsData);
      });

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
      toast.error("Could not load people. Try again or contact support.");
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

      setSaveProgress({ done: 0, total: byCompany.size });

      for (const [companyId, persons] of byCompany) {
        const company = companies.find((c) => c.id === companyId);
        if (!company) continue;
        const result = await scoutSave({
          people: persons.map((p) => p._raw),
          company: company._raw,
          dataMode,
        });
        totalSaved += result.saved.length;
        allSkipped.push(...result.skipped);
        setSaveProgress((prev) => ({ ...prev, done: prev.done + 1 }));
      }

      if (totalSaved > 0) {
        toast.success(`${totalSaved} lead${totalSaved > 1 ? "s" : ""} saved — check Leads queue`);
        // mark saved people so they show as already-added if user returns
        const savedNames = selectedPeople.map((p) => p.name.toLowerCase());
        setExistingContactNames((prev) => new Set([...prev, ...savedNames]));
        void (async () => {
          try {
            const leadsRes = await fetch("/api/leads/dedupe");
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
      setSaveProgress({ done: 0, total: 0 });
    }
  }

  function handleBackToCompanies() {
    setView("companies");
    setSelectedPersonIds(new Set());
    setPrimaryPersonId(null);
  }


  const filtersCollapsed =
    isMobileLayout &&
    hasFetched &&
    !loadingCompanies &&
    !filtersExpanded &&
    ((view === "companies" && companies.length > 0) || (view === "people" && people.length > 0));

  const mobileSubtitle = useMemo(() => {
    if (!cities.length) return "Pick a city to start scouting";
    const cityPart =
      cities.length === 1 ? cities[0] : `${cities.length} cities`;
    if (view === "people") {
      return `${cityPart} · ${people.length} decision-maker${people.length === 1 ? "" : "s"}`;
    }
    if (companies.length > 0) {
      return `${cityPart} · ${companies.length} compan${companies.length === 1 ? "y" : "ies"}`;
    }
    return cityPart;
  }, [cities, view, people.length, companies.length]);

  const canScoutMobile = settingsLoaded && cities.length > 0 && !loadingCompanies;
  const canSearchMobile =
    settingsLoaded && cities.length > 0 && companySearchQuery.trim().length > 0 && !loadingCompanies;

  useEffect(() => {
    if (hasFetched && companies.length > 0) {
      setFiltersExpanded(false);
    }
  }, [hasFetched, companies.length]);

  const showMobileDetail =
    isMobileLayout &&
    ((view === "companies" && primaryCompany) || (view === "people" && primaryPerson));

  const toolbarProps = {
    view,
    cities,
    industries,
    seniority,
    departments,
    selectedCount: view === "companies" ? selectedCompanyIds.size : selectedPersonIds.size,
    settingsLoaded,
    scoutCompaniesLimit,
    scoutLeadsLimit,
    loadingCompanies,
    loadingMore,
    saving,
    scoutMode,
    companySearchQuery,
    onCitiesChange: handleCitiesChange,
    onIndustryToggle: toggleIndustry,
    onSeniorityToggle: toggleSeniority,
    onDepartmentToggle: toggleDepartment,
    onFetchNewCompanies: handleFetchNewCompanies,
    onFetchLeads: handleFetchLeads,
    onAddLeads: handleAddLeads,
    onScoutMore: handleScoutMore,
    onLoadMore: handleLoadMore,
    onRefresh: handleRefresh,
    onScoutModeChange: handleScoutModeChange,
    onCompanySearchQueryChange: setCompanySearchQuery,
    onSearchByName: handleSearchByName,
  } as const;

  const companiesResults = view === "companies" ? (
    loadingCompanies ? (
      <DiscoveringLoader
        hints={[
          cities.length ? `Scanning ${cities.join(", ")}` : "Scanning company directories",
          industries.length ? `Filtering ${industries.join(", ")}` : "Matching all industries",
          "Ranking by gift potential",
        ]}
      />
    ) : companies.length === 0 ? (
      <ScoutCompaniesEmpty hasFetched={hasFetched} scoutMode={scoutMode} fetchMessage={fetchMessage} />
    ) : (
      <>
        {discoveryNotice ? (
          <div className="mx-4 mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] leading-snug text-amber-950 lg:mx-5">
            {discoveryNotice}
          </div>
        ) : null}
        {isMobileLayout && scoutCompaniesLimit <= 1 && companies.length > 0 ? (
          <div className="mx-3 mt-2 rounded-xl border border-ish-stratus-blue/20 bg-ish-canvas/80 px-3 py-2 text-[12px] leading-snug text-ish-ink-soft">
            1 company per scout batch. Tap <span className="font-semibold text-ish-ink">Load more</span> in the menu, or raise the limit in Settings.
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-3 px-4 py-2 lg:px-5">
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
          compact={isMobileLayout}
        />
        {hasMore && !isMobileLayout ? (
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
        ) : null}
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
          message={
            fetchProgress.total > 1
              ? `Finding decision-makers (${fetchProgress.done} of ${fetchProgress.total} companies)`
              : "Finding decision-makers"
          }
          hints={["Searching LinkedIn profiles", "Matching seniority & titles", "Ranking key decision-makers"]}
          compact
        />
      ) : people.length === 0 ? (
        <ScoutPeopleEmpty
          headline={peopleNotice?.headline ?? "No decision-makers found"}
          detail={peopleNotice?.detail ?? "Try companies with websites or well-known brands."}
        />
      ) : saving ? (
        <SavingLeadsLoader count={selectedPersonIds.size} progress={saveProgress} />
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
  );

  const rolePicker = showRolePicker ? (
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
  ) : null;

  const mobilePrimaryLabel = (() => {
    if (view === "people") {
      if (saving) return "Saving…";
      if (selectedPersonIds.size > 0) return `Add ${selectedPersonIds.size} as Leads`;
      return "Select people to save";
    }
    if (selectedCompanyIds.size > 0) {
      return `Fetch Leads · ${selectedCompanyIds.size}`;
    }
    if (scoutMode === "search") {
      return loadingCompanies ? "Searching…" : "Search";
    }
    return loadingCompanies ? "Scouting…" : "Scout now";
  })();

  const mobilePrimaryDisabled = (() => {
    if (view === "people") return selectedPersonIds.size === 0 || saving;
    if (selectedCompanyIds.size > 0) return false;
    return scoutMode === "search" ? !canSearchMobile : !canScoutMobile;
  })();

  const mobilePrimaryAction = () => {
    setFiltersExpanded(false);
    if (view === "people") {
      handleAddLeads();
      return;
    }
    if (selectedCompanyIds.size > 0) {
      handleFetchLeads();
      return;
    }
    if (scoutMode === "search") {
      handleSearchByName();
      return;
    }
    handleFetchNewCompanies();
  };

  const mobilePrimaryColor =
    view === "people" || selectedCompanyIds.size > 0 ? "green" : "yellow";

  if (isMobileLayout && showMobileDetail) {
    return (
      <>
        <div className="fixed inset-0 z-40 flex flex-col bg-white">
          <MobileHeader
            title={view === "companies" ? primaryCompany?.name ?? "Company" : primaryPerson?.name ?? "Contact"}
            showBack
            onBack={() => (view === "companies" ? setPrimaryCompanyId(null) : setPrimaryPersonId(null))}
          />
          <div className="min-h-0 flex-1 overflow-y-auto">
            {view === "companies" && primaryCompany ? (
              <CompanyDetailPanel company={primaryCompany} decisionMakerHint={primaryCompanyDecisionMaker} decisionMakerLeadId={primaryCompanyDecisionMakerLeadId} />
            ) : view === "people" && primaryPerson ? (
              <PersonDetailPanel person={primaryPerson} index={primaryPersonIndex} />
            ) : null}
          </div>
        </div>
        {rolePicker}
      </>
    );
  }

  if (isMobileLayout) {
    return (
      <>
        <MobilePageLayout
          title="Scouting"
          subtitle={mobileSubtitle}
          largeTitle
          className="ish-scout-page lg:hidden"
          contentClassName="!pb-0"
          rightSlot={
            <button
              type="button"
              onClick={() => setOverflowOpen(true)}
              className="flex size-10 items-center justify-center rounded-full bg-white/90 text-ish-ink shadow-ish ring-1 ring-ish-border/40 active:scale-95"
              aria-label="More actions"
            >
              <MoreVertical className="size-4 text-ish-stratus-blue" />
            </button>
          }
          footer={
            <ActionBar>
              <button
                type="button"
                onClick={mobilePrimaryAction}
                disabled={mobilePrimaryDisabled}
                className={cn(
                  "flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl text-[15px] font-bold transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50",
                  mobilePrimaryColor === "yellow" && !mobilePrimaryDisabled &&
                    "bg-ish-yellow-gradient text-ish-black shadow-ish-yellow-sm",
                  mobilePrimaryColor === "green" && !mobilePrimaryDisabled &&
                    "bg-ish-green text-white shadow-[var(--shadow-ish)]",
                  mobilePrimaryDisabled && "bg-ish-canvas text-ish-ink-faint",
                )}
              >
                {mobilePrimaryColor === "yellow" && !mobilePrimaryDisabled ? <Compass className="size-4" /> : null}
                {mobilePrimaryLabel}
              </button>
            </ActionBar>
          }
        >
          <ScoutingToolbar
            {...toolbarProps}
            isMobileLayout
            hideActions
            filtersCollapsed={filtersCollapsed}
            onExpandFilters={() => setFiltersExpanded(true)}
          />
          <div className="min-h-0 flex-1 pb-4">{companiesResults}</div>
        </MobilePageLayout>

        <BottomSheet open={overflowOpen} onClose={() => setOverflowOpen(false)} title="Scout options">
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => {
                handleScoutModeChange(scoutMode === "autopilot" ? "search" : "autopilot");
                setOverflowOpen(false);
              }}
              className="flex min-h-[48px] items-center gap-3 rounded-2xl border border-ish-border/60 bg-white px-4 text-left text-[14px] font-semibold text-ish-ink active:scale-[0.99]"
            >
              <Search className="size-4 text-ish-stratus-blue" />
              Switch to {scoutMode === "autopilot" ? "Search mode" : "Autopilot"}
            </button>
            {scoutMode === "autopilot" && view === "companies" ? (
              <>
                <button
                  type="button"
                  onClick={() => { handleRefresh(); setOverflowOpen(false); }}
                  disabled={loadingCompanies || cities.length === 0}
                  className="flex min-h-[48px] items-center gap-3 rounded-2xl border border-ish-border/60 bg-white px-4 text-left text-[14px] font-semibold text-ish-ink active:scale-[0.99] disabled:opacity-50"
                >
                  Refresh results
                </button>
                <button
                  type="button"
                  onClick={() => { handleLoadMore(); setOverflowOpen(false); }}
                  disabled={loadingMore || !hasMore}
                  className="flex min-h-[48px] items-center gap-3 rounded-2xl border border-ish-border/60 bg-white px-4 text-left text-[14px] font-semibold text-ish-ink active:scale-[0.99] disabled:opacity-50"
                >
                  {loadingMore ? "Loading more…" : "Load more companies"}
                </button>
              </>
            ) : null}
            {view === "people" ? (
              <button
                type="button"
                onClick={() => { handleScoutMore(); setOverflowOpen(false); }}
                disabled={loadingMore}
                className="flex min-h-[48px] items-center gap-3 rounded-2xl border border-ish-border/60 bg-white px-4 text-left text-[14px] font-semibold text-ish-ink active:scale-[0.99] disabled:opacity-50"
              >
                <Compass className="size-4 text-ish-stratus-blue" />
                {loadingMore ? "Scouting more…" : "Scout more companies"}
              </button>
            ) : null}
          </div>
        </BottomSheet>
        {rolePicker}
      </>
    );
  }

  return (
    <>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <ScoutingToolbar {...toolbarProps} />
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <div className="min-w-0 flex-1 overflow-y-auto bg-white/40">{companiesResults}</div>
          <div className="hidden w-[360px] shrink-0 overflow-y-auto border-l border-ish-border bg-white lg:block">
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
      {rolePicker}
    </>
  );
}
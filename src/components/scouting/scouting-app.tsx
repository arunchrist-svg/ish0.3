"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
// import { ScoutingProgressBar } from "./scouting-progress-bar";
import { ScoutingToolbar, type ScoutMode } from "./scouting-toolbar";
import { DiscoveringLoader } from "./discovering-loader";
import { CompaniesGrid } from "./companies-grid";
import { CompanyDetailPanel } from "./company-detail-panel";
import {
  MissingWebsitePrompt,
  type WebsitePasteEntry,
  type WebsiteRowStatus,
} from "./missing-website-prompt";
import { LeadsGrid } from "./leads-grid";
import { PersonDetailPanel } from "./person-detail-panel";
import {
  scoutCompanies,
  scoutCompaniesStream,
  scoutPeople,
  scoutPeopleBatchStream,
  scoutSave,
  scoutSaveBatchStream,
  scoutSaveCompanies,
  scoutSavedCompanies,
  scoutBootstrap,
  scoutExactSearch,
  scoutCreateSession,
  scoutUpdateSession,
  scoutGetSession,
  type ScoutSessionDetail,
} from "@/lib/api-client";
import { useSession } from "@/components/providers/session-provider";
import { notifyCrmRecordsChanged } from "@/lib/crm-refresh";
import { mapWithConcurrency } from "@/lib/async";
import { isLogoUrl } from "@/lib/company-logo";
import type { ScoutCompanyResult, ScoutPersonResult, DataMode } from "@/lib/enrichment/types";
import type { ScoutSessionFilters, ScoutSessionPerson, ScoutSessionUiState } from "@/db";
import { toast } from "sonner";
import { normalizeLinkedInUrl, personFieldOrEmpty, cn } from "@/lib/utils";
import {
  assessPeopleFetchRisk,
  inferRoleFromTitle,
  peopleAndFilterWarning,
} from "@/lib/enrichment/people-role-filter";
import {
  ActionBar,
  AppPageHeader,
  BottomSheet,
  EmptyState,
  MobileHeader,
  MobilePageLayout,
} from "@/design-system";
import { useIsMobileLayout } from "@/hooks/use-media-query";
import { Compass, Bookmark, BookmarkPlus, History, MapPin, MoreVertical, Search, Telescope, TriangleAlert, Users } from "lucide-react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { ScoutHistoryPanel } from "./scout-history-panel";
import { RolePickerModal, FetchLeadsRiskModal } from "./role-picker-modal";
import { SCOUT_SENIORITY, SCOUT_DEPARTMENTS, SCOUT_EMPLOYEE_BANDS, parseScoutVerticalScope, type ScoutVerticalScope } from "@/lib/scouting-data";
import { extractEmployeesFromText, normalizeEmployeeField } from "@/lib/enrichment/employee-size";
import {
  peoplePerCompanyLimit,
  scoutPeopleCoverage,
  selectPeopleByCompanyCap,
} from "@/lib/enrichment/people-diversity";
import { summarizeEmptyPeopleFetch } from "@/lib/enrichment/people-fetch-notice";
import { isUnusableCompanyDomain, parsePastedCompanyWebsite } from "@/lib/enrichment/company-domain-quality";
import {
  defaultLabelsFromLocationOptions,
  defaultScoutLocationScope,
  locationOptionsFromAreaOfFocus,
  locationOptionsFromSelection,
  parseScoutLocationScope,
  scoutLocationOptions,
  scoutPickerAllowedLabels,
  type ScoutGeoSelection,
  type ScoutLocationOption,
  type ScoutLocationScope,
} from "@/lib/geo/india";
import { applyNearbyAreaSelectionToFocuses, type ScoutAreaOfFocus } from "@/lib/geo/area-of-focus";
import {
  expandPeopleFiltersForOffer,
  FESTIVE_SWEETS_BUYER_DEPARTMENTS,
  festiveSweetsBuyerGuidance,
  type PlatformIntent,
} from "@/lib/brand/platform-intent";
import {
  scoutCompanyMatchesSaved,
  uniqueScoutCompanies,
  type AccountMatchShape,
} from "@/lib/scout/account-match";

type View = "companies" | "people";

type CompanyShape = ReturnType<typeof toCompanyShape>;

const SCOUT_FILTER_SESSION_KEY = "ish-scout-filter-scopes";

type ScoutFilterSession = {
  locationScope?: ScoutLocationScope;
  verticalScope?: ScoutVerticalScope;
  industries?: string[];
  businesses?: string[];
  citiesByScope?: Partial<Record<ScoutLocationScope, string[]>>;
};

function readScoutFilterSession(): ScoutFilterSession {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(SCOUT_FILTER_SESSION_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as ScoutFilterSession;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeScoutFilterSession(patch: ScoutFilterSession) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(SCOUT_FILTER_SESSION_KEY, JSON.stringify({ ...readScoutFilterSession(), ...patch }));
  } catch {
    /* ignore quota */
  }
}


function resolveCompanyDomain(raw: ScoutCompanyResult): string | undefined {
  if (raw.domain) return raw.domain;
  if (!raw.website) return undefined;
  try {
    return new URL(raw.website.startsWith("http") ? raw.website : `https://${raw.website}`).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}


function companyNeedsOfficialWebsite(company: { _raw: ScoutCompanyResult }): boolean {
  const host = resolveCompanyDomain(company._raw);
  return !host || isUnusableCompanyDomain(host);
}

function noticeKey(msg: string): string {
  if (/quota|usage limit/i.test(msg)) return "tavily-quota";
  if (/google places/i.test(msg)) return "google-places-fallback";
  if (/no directory listings/i.test(msg)) return "no-directory";
  return msg.slice(0, 120);
}


function pickPeopleNotice(
  messages: string[],
  companyCount = 1,
  filters?: {
    cities?: string[];
    seniority?: string[];
    departments?: string[];
    platformIntent?: PlatformIntent | null;
    searchKind?: "industry" | "business";
  },
): { headline: string; detail: string } {
  const expanded = expandPeopleFiltersForOffer(
    filters?.platformIntent,
    filters?.seniority ?? [],
    filters?.departments ?? [],
    { treatAsGifting: filters?.platformIntent === "corporate_gifting", searchKind: filters?.searchKind },
  );
  return summarizeEmptyPeopleFetch({
    companyCount,
    warnings: messages,
    cities: filters?.cities,
    seniority: expanded.seniority,
    departments: expanded.departments,
    searchKind: filters?.searchKind,
  });
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
    logo: isLogoUrl(c.logo) ? c.logo : undefined,
    domain: c.domain,
    website: c.website,
    name: c.name,
    type: c.industry ?? "Corporate",
    city: c.city ?? "",
    industry: c.industry ?? "",
    employees:
      normalizeEmployeeField(c.employees) ||
      extractEmployeesFromText(`${c.intelNotes ?? ""} ${c.name}`) ||
      "—",
    revenue: c.revenue ?? "—",
    founded: 0,
    fitScore: c.fitScore ?? 60,
    budgetBand: c.budgetBand ?? "—",
    pastGifting: (c.pastGifting ?? []) as { year: string; occasion: string; items: string; perPerson: string }[],
    intelligenceNotes: c.intelNotes ?? "",
    leadabilityScore: c.leadabilityScore,
    leadabilityBand: c.leadabilityBand,
    leadabilityMatchedPeople: c.leadabilityMatchedPeople,
    leadabilityMatchedInCity: c.leadabilityMatchedInCity,
    leadabilityProbeSource: c.leadabilityProbeSource,
    _raw: c,
  };
}

function toPersonShape(p: ScoutPersonResult, companyId: string, idx: number) {
  const id = isUsableExternalId(p.externalId)
    ? p.externalId!.trim()
    : slugifyKey("p", companyId, p.name, idx) || `p-${companyId}-${idx}`;
  const title = personFieldOrEmpty(p.title);
  const inferred = inferRoleFromTitle(title);

  return {
    id,
    companyId,
    name: p.name,
    title,
    department: personFieldOrEmpty(p.department) || inferred.department || "",
    seniority: personFieldOrEmpty(p.seniority) || inferred.seniority || "",
    isKeyDecisionMaker: p.isKeyDM ?? false,
    matchScore: p.matchScore ?? 55,
    engagementSignals: p.engagementSignals ?? [],
    linkedIn: normalizeLinkedInUrl(p.linkedIn) ?? "",
    email: p.email ? maskEmail(p.email) : "—",
    phone: p.phone ? maskPhone(p.phone) : "—",
    bio: p.bio ?? "",
    location: p.location ?? "",
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

function capFetchedPeople(
  people: ReturnType<typeof toPersonShape>[],
  leadsLimit: number,
) {
  return selectPeopleByCompanyCap(people, {
    perCompany: peoplePerCompanyLimit(leadsLimit),
    // Cap by company id so every selected company keeps its own slots.
    bucketOf: (person) => person.companyId,
  });
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


function ScoutCompaniesEmpty({
  hasFetched,
  scoutMode,
  fetchMessage,
  showingSaved,
  icpHint,
  locationScope,
}: {
  hasFetched: boolean;
  scoutMode: ScoutMode;
  fetchMessage: string | null;
  showingSaved?: boolean;
  icpHint?: string | null;
  locationScope?: ScoutLocationScope;
}) {
  if (showingSaved) {
    return (
      <div className="mx-4 mt-6 rounded-[24px] border border-brand-border/50 bg-white px-6 py-12 text-center shadow-ish lg:mx-5 lg:mt-8">
        <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl bg-brand-canvas text-brand-ink-soft">
          <Bookmark className="size-7" />
        </div>
        <EmptyState
          title="No saved companies yet"
          description="Select companies from Scout, then tap Save companies. Open Saved and use Extract leads to find decision-makers."
          className="py-0"
        />
      </div>
    );
  }

  if (!hasFetched) {
    return (
      <div className="mx-4 mt-6 rounded-[24px] border border-brand-border/50 bg-white px-6 py-12 text-center shadow-ish lg:mx-5 lg:mt-8">
        <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl bg-brand-yellow-gradient shadow-brand-yellow-sm">
          <Compass className="size-7 text-brand-black" />
        </div>
        <EmptyState
          title={scoutMode === "search" ? "Search by company name" : "Ready to scout"}
          description={
            scoutMode === "search"
              ? "Pick a city, type a company name, then tap Search."
              : icpHint
                ? `Pick a city, then tap Scout now. ${icpHint}`
                : "Pick a city, then tap Scout now. Leave industry open for broader results."
          }
          className="py-0"
        />
      </div>
    );
  }

  return (
    <div className="mx-4 mt-6 rounded-[24px] border border-brand-border/50 bg-white px-6 py-12 text-center shadow-ish lg:mx-5 lg:mt-8">
      <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl bg-brand-canvas text-brand-ink-soft">
        <MapPin className="size-7" />
      </div>
      <EmptyState
        title={fetchMessage ?? (scoutMode === "search" ? "No matches found" : "No companies found")}
        description={
          fetchMessage?.includes("API") || fetchMessage?.includes("missing")
            ? "Try again in a few minutes or adjust settings."
            : scoutMode === "search"
              ? "Try a different spelling or company name."
              : locationScope === "focus"
                ? "Widen the focus radius, or switch to Area of Interest to search the whole city."
                : "Narrow to 2-3 industries, or try a nearby larger city."
        }
        className="py-0"
      />
    </div>
  );
}

function ScoutPeopleEmpty({
  headline,
  detail,
  missingWebsites,
  applyingWebsites,
  websiteRowStatus,
  onFetchWebsites,
}: {
  headline: string;
  detail: string;
  missingWebsites: { id: string; name: string }[];
  applyingWebsites?: boolean;
  websiteRowStatus?: Record<string, WebsiteRowStatus>;
  onFetchWebsites: (entries: WebsitePasteEntry[]) => void | Promise<void>;
}) {
  return (
    <div className="mx-4 mt-4 rounded-[24px] border border-brand-border/50 bg-white px-6 py-12 text-center shadow-ish">
      <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl bg-brand-canvas text-brand-ink-soft">
        <Users className="size-7" />
      </div>
      <EmptyState title={headline} description={detail} className="py-0" />
      <div className="mx-auto mt-6 w-full max-w-lg text-left">
        <MissingWebsitePrompt
          companies={missingWebsites}
          applying={applyingWebsites}
          rowStatus={websiteRowStatus}
          onFetch={onFetchWebsites}
        />
      </div>
    </div>
  );
}


export function ScoutingApp() {
  const isMobileLayout = useIsMobileLayout();
  const { session } = useSession();
  const [view, setView] = useState<View>("companies");
  const [cities, setCities] = useState<string[]>([]);
  const [locationOptions, setLocationOptions] = useState<ScoutLocationOption[]>([]);
  const [areasOfFocus, setAreasOfFocus] = useState<ScoutAreaOfFocus[]>([]);
  const [scoutGeo, setScoutGeo] = useState<ScoutGeoSelection | null>(null);
  const [locationScope, setLocationScope] = useState<ScoutLocationScope>("interest");
  const [verticalScope, setVerticalScope] = useState<ScoutVerticalScope>("industries");
  const [industries, setIndustries] = useState<string[]>([]);
  const [businesses, setBusinesses] = useState<string[]>([]);
  const [employeeBands, setEmployeeBands] = useState<string[]>([]);
  const [seniority, setSeniority] = useState<string[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [peopleCities, setPeopleCities] = useState<string[]>([]);
  const [dataMode, setDataMode] = useState<DataMode>("free");
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [icpHint, setIcpHint] = useState<string | null>(null);
  const [platformIntent, setPlatformIntent] = useState<PlatformIntent | null>(null);
  const [scoutCompaniesLimit, setScoutCompaniesLimit] = useState(1);
  const [scoutLeadsLimit, setScoutLeadsLimit] = useState(1);
  const [savedAccountShapes, setSavedAccountShapes] = useState<AccountMatchShape[]>([]);

  const [companies, setCompanies] = useState<CompanyShape[]>([]);
  const [people, setPeople] = useState<ReturnType<typeof toPersonShape>[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingPeople, setLoadingPeople] = useState(false);
  const [fetchProgress, setFetchProgress] = useState({ done: 0, total: 0 });
  const [saving, setSaving] = useState(false);
  const [savingCompanies, setSavingCompanies] = useState(false);
  const showingSavedRef = useRef(false);
  const [showingSaved, setShowingSaved] = useState(false);
  showingSavedRef.current = showingSaved;
  const [saveProgress, setSaveProgress] = useState({ done: 0, total: 0 });
  const [hasMore, setHasMore] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);
  const [fetchMessage, setFetchMessage] = useState<string | null>(null);
  const [discoveryNotice, setDiscoveryNotice] = useState<string | null>(null);
  const [peopleNotice, setPeopleNotice] = useState<{ headline: string; detail: string } | null>(null);
  const [applyingWebsites, setApplyingWebsites] = useState(false);
  const [applyingWebsiteIds, setApplyingWebsiteIds] = useState<Set<string>>(new Set());
  const [websiteRowStatus, setWebsiteRowStatus] = useState<Record<string, WebsiteRowStatus>>({});
  const [fetchSeed, setFetchSeed] = useState(0);
  const shownNoticesRef = useRef(new Set<string>());

  const [selectedCompanyIds, setSelectedCompanyIds] = useState<Set<string>>(new Set());
  const [primaryCompanyId, setPrimaryCompanyId] = useState<string | null>(null);
  const [selectedPersonIds, setSelectedPersonIds] = useState<Set<string>>(new Set());
  const [primaryPersonId, setPrimaryPersonId] = useState<string | null>(null);
  const peopleRef = useRef(people);
  peopleRef.current = people;
  const selectedPersonIdsRef = useRef(selectedPersonIds);
  selectedPersonIdsRef.current = selectedPersonIds;
  const primaryPersonIdRef = useRef(primaryPersonId);
  primaryPersonIdRef.current = primaryPersonId;
  const [existingContactNames, setExistingContactNames] = useState<Set<string>>(new Set());
  const [crmLeadIdsByKey, setCrmLeadIdsByKey] = useState<Map<string, string>>(new Map());
  const [scoutMode, setScoutMode] = useState<ScoutMode>("autopilot");
  const [companySearchQuery, setCompanySearchQuery] = useState("");
  const [showRolePicker, setShowRolePicker] = useState(false);
  const [showFetchRisk, setShowFetchRisk] = useState(false);
  const [pendingFetchIds, setPendingFetchIds] = useState<Set<string> | null>(null);
  const [pendingFetchRoles, setPendingFetchRoles] = useState<{
    seniority: string[];
    departments: string[];
  } | null>(null);
  const [filtersExpanded, setFiltersExpanded] = useState(true);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activeSessionTitle, setActiveSessionTitle] = useState<string | null>(null);

  const persistAreaSelectionTimer = useRef<number | null>(null);
  const sessionPersistTimer = useRef<number | null>(null);
  const activeSessionIdRef = useRef<string | null>(null);
  activeSessionIdRef.current = activeSessionId;
  const sessionPersistFailToastRef = useRef(false);
  const sessionDeepLinkHandled = useRef(false);
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const locationScopeRef = useRef<ScoutLocationScope>(locationScope);
  locationScopeRef.current = locationScope;
  const verticalScopeRef = useRef<ScoutVerticalScope>(verticalScope);
  verticalScopeRef.current = verticalScope;
  const peopleFiltersByScopeRef = useRef<Record<ScoutVerticalScope, { seniority: string[]; departments: string[] }>>({
    industries: { seniority: [], departments: [] },
    businesses: { seniority: [], departments: [] },
  });
  const citiesByScopeRef = useRef<Partial<Record<ScoutLocationScope, string[]>>>({});

  function applyLocationOptions(
    locations: ScoutLocationOption[],
    focuses?: ScoutAreaOfFocus[] | null,
    preferredCities?: string[],
  ) {
    setLocationOptions(locations);
    if (focuses !== undefined) setAreasOfFocus(focuses ?? []);
    const allowed = scoutPickerAllowedLabels(locations);
    setCities((prev) => {
      if (!locations.length) return [];
      const source = preferredCities ?? prev;
      const kept = source.filter((c) => allowed.has(c));
      if (kept.length) return kept;
      return defaultLabelsFromLocationOptions(locations);
    });
  }

  function clearActiveSession() {
    activeSessionIdRef.current = null;
    setActiveSessionId(null);
    setActiveSessionTitle(null);
  }

  function buildSessionFilters(overrides?: Partial<ScoutSessionFilters>): ScoutSessionFilters {
    return {
      cities,
      industries,
      businesses,
      employeeBands,
      seniority,
      departments,
      peopleCities,
      locationScope: locationScope === "focus" ? "focus" : "interest",
      verticalScope,
      searchKind: verticalScope === "businesses" ? "business" : "industry",
      scoutCompaniesLimit,
      scoutLeadsLimit,
      ...(companySearchQuery.trim() ? { companyName: companySearchQuery.trim() } : {}),
      ...overrides,
    };
  }

  function companiesForSession(list: CompanyShape[]): ScoutCompanyResult[] {
    return list.map((c) => ({
      ...c._raw,
      externalId: isUsableExternalId(c._raw.externalId) ? c._raw.externalId : c.id,
    }));
  }

  function peopleForSession(list: ReturnType<typeof toPersonShape>[]): ScoutSessionPerson[] {
    return list.map((p) => ({
      ...p._raw,
      externalId: isUsableExternalId(p._raw.externalId) ? p._raw.externalId : p.id,
      companyId: p.companyId,
    }));
  }

  function buildSessionUiState(overrides?: Partial<ScoutSessionUiState>): ScoutSessionUiState {
    return {
      selectedCompanyIds: [...selectedCompanyIds],
      selectedPersonIds: [...selectedPersonIds],
      primaryCompanyId,
      primaryPersonId,
      view,
      fetchSeed,
      hasMore,
      companySearchQuery,
      ...overrides,
    };
  }

  function toastSessionPersistError() {
    if (sessionPersistFailToastRef.current) return;
    sessionPersistFailToastRef.current = true;
    toast.error("Could not save Scout session history. Discovery still works.");
  }

  async function createSessionFromResults(params: {
    companies: CompanyShape[];
    people?: ReturnType<typeof toPersonShape>[];
    mode?: ScoutMode;
    filters?: ScoutSessionFilters;
    uiState?: ScoutSessionUiState;
    warnings?: string[];
  }) {
    try {
      const { session } = await scoutCreateSession({
        mode: params.mode ?? scoutMode,
        filters: params.filters ?? buildSessionFilters(),
        companies: companiesForSession(params.companies),
        people: peopleForSession(params.people ?? []),
        uiState: params.uiState ?? buildSessionUiState({
          selectedCompanyIds: params.companies.map((c) => c.id),
          view: "companies",
        }),
        warnings: params.warnings,
      });
      activeSessionIdRef.current = session.id;
      setActiveSessionId(session.id);
      setActiveSessionTitle(session.title);
      sessionPersistFailToastRef.current = false;
      return session;
    } catch (e) {
      console.error("[scouting] create session failed:", e);
      toastSessionPersistError();
      return null;
    }
  }

  async function patchActiveSession(params: {
    companies?: CompanyShape[];
    people?: ReturnType<typeof toPersonShape>[];
    filters?: ScoutSessionFilters;
    uiState?: ScoutSessionUiState;
    warnings?: string[];
    mode?: ScoutMode;
  }) {
    const id = activeSessionIdRef.current;
    if (!id) return;
    try {
      const { session } = await scoutUpdateSession(id, {
        mode: params.mode,
        filters: params.filters,
        companies: params.companies ? companiesForSession(params.companies) : undefined,
        people: params.people ? peopleForSession(params.people) : undefined,
        uiState: params.uiState,
        warnings: params.warnings,
      });
      setActiveSessionTitle(session.title);
      sessionPersistFailToastRef.current = false;
    } catch (e) {
      console.error("[scouting] update session failed:", e);
      toastSessionPersistError();
    }
  }

  function scheduleSessionPatch(params: {
    companies?: CompanyShape[];
    people?: ReturnType<typeof toPersonShape>[];
    filters?: ScoutSessionFilters;
    uiState?: ScoutSessionUiState;
    warnings?: string[];
    mode?: ScoutMode;
  }) {
    if (!activeSessionIdRef.current) return;
    if (sessionPersistTimer.current) window.clearTimeout(sessionPersistTimer.current);
    sessionPersistTimer.current = window.setTimeout(() => {
      void patchActiveSession(params);
    }, 1000);
  }

  async function restoreScoutSession(session: ScoutSessionDetail) {
    const filters = session.filters;
    setShowingSaved(false);
    setScoutMode(session.mode);
    setLocationScope(filters.locationScope);
    setVerticalScope(filters.verticalScope);
    setCities(filters.cities ?? []);
    citiesByScopeRef.current[filters.locationScope] = filters.cities ?? [];
    setIndustries(filters.industries ?? []);
    setBusinesses(filters.businesses ?? []);
    setEmployeeBands(filters.employeeBands ?? []);
    setSeniority(filters.seniority ?? []);
    setDepartments(filters.departments ?? []);
    setPeopleCities(filters.peopleCities ?? []);
    setCompanySearchQuery(filters.companyName ?? session.uiState.companySearchQuery ?? "");
    writeScoutFilterSession({
      locationScope: filters.locationScope,
      verticalScope: filters.verticalScope,
      industries: filters.industries ?? [],
      businesses: filters.businesses ?? [],
      citiesByScope: { ...citiesByScopeRef.current },
    });

    const shaped = dedupeCompanyShapes(session.companies.map((c, i) => toCompanyShape(c, i)));
    const companyIdByKey = new Map(shaped.map((c) => [c.id, c.id]));
    const shapedPeople = session.people.map((p, i) => {
      const companyId = companyIdByKey.get(p.companyId) ? p.companyId : p.companyId;
      return toPersonShape(p, companyId, i);
    });

    setCompanies(shaped);
    setPeople(shapedPeople);
    peopleRef.current = shapedPeople;
    setSelectedCompanyIds(new Set(session.uiState.selectedCompanyIds ?? []));
    setSelectedPersonIds(new Set(session.uiState.selectedPersonIds ?? []));
    setPrimaryCompanyId(session.uiState.primaryCompanyId ?? shaped[0]?.id ?? null);
    setPrimaryPersonId(session.uiState.primaryPersonId ?? null);
    setView(session.uiState.view === "people" && shapedPeople.length ? "people" : "companies");
    setFetchSeed(session.uiState.fetchSeed ?? 0);
    setHasMore(Boolean(session.uiState.hasMore));
    setHasFetched(true);
    setDiscoveryNotice(session.warnings?.length ? session.warnings.join(" ") : null);
    setFetchMessage(null);
    setPeopleNotice(null);
    activeSessionIdRef.current = session.id;
    setActiveSessionId(session.id);
    setActiveSessionTitle(session.title);
  }

  async function openScoutSessionById(id: string) {
    const { session } = await scoutGetSession(id);
    await restoreScoutSession(session);
    const params = new URLSearchParams(searchParams.toString());
    params.set("session", id);
    router.replace(`${pathname}?${params.toString()}`);
  }

  useEffect(() => {
    return () => {
      if (sessionPersistTimer.current) window.clearTimeout(sessionPersistTimer.current);
    };
  }, []);

  useEffect(() => {
    if (sessionDeepLinkHandled.current || !settingsLoaded) return;
    const sessionId = searchParams.get("session");
    if (!sessionId) return;
    sessionDeepLinkHandled.current = true;
    void openScoutSessionById(sessionId).catch(() => {
      toast.error("Could not open that Scout session");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot deep link after bootstrap
  }, [settingsLoaded, searchParams]);

  useEffect(() => {
    if (!activeSessionId || showingSaved) return;
    scheduleSessionPatch({
      uiState: buildSessionUiState(),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selection/view debounce only
  }, [selectedCompanyIds, selectedPersonIds, primaryCompanyId, primaryPersonId, view, activeSessionId, showingSaved]);

  useEffect(() => {
    const defaults = session?.scoutBrandDefaults;
    if (!defaults) return;
    const intent = defaults.platformIntent as PlatformIntent | undefined;
    if (intent) setPlatformIntent(intent);
    const summary = defaults.icpSummary?.trim();
    if (summary) setIcpHint(summary);
    const guidance = festiveSweetsBuyerGuidance(intent);
    if (guidance && verticalScopeRef.current !== "businesses") setIcpHint(guidance);
    if (defaults.industries?.length) {
      setIndustries((prev) => (prev.length ? prev : defaults.industries!));
    }
    if (defaults.departments?.length) {
      setDepartments((prev) => (prev.length ? prev : defaults.departments!));
    }
    if (defaults.seniority?.length) {
      setSeniority((prev) => (prev.length ? prev : defaults.seniority!));
    }
  }, [session]);

  useEffect(() => {
    const stored = readScoutFilterSession();
    const storedVertical = parseScoutVerticalScope(stored.verticalScope);
    if (storedVertical) setVerticalScope(storedVertical);
    if (Array.isArray(stored.industries)) setIndustries(stored.industries.filter((v) => typeof v === "string"));
    if (Array.isArray(stored.businesses)) setBusinesses(stored.businesses.filter((v) => typeof v === "string"));
    if (stored.citiesByScope) citiesByScopeRef.current = stored.citiesByScope;

    void scoutBootstrap()
      .then((data) => {
        const map = new Map<string, string>();
        if (data.dedupeKeys?.length) {
          for (const row of data.dedupeKeys) {
            map.set(row.key, row.id);
            if (row.name) map.set(row.name.toLowerCase(), row.id);
          }
          setCrmLeadIdsByKey(map);
          setExistingContactNames(
            new Set(
              data.dedupeKeys
                .map((r) => r.name?.toLowerCase() ?? r.key.split("|").pop() ?? "")
                .filter(Boolean),
            ),
          );
        } else if (data.leads?.length) {
          for (const lead of data.leads) {
            map.set(`${lead.company.toLowerCase()}|${lead.name.toLowerCase()}`, lead.id);
            map.set(lead.name.toLowerCase(), lead.id);
          }
          setCrmLeadIdsByKey(map);
          setExistingContactNames(new Set(data.leads.map((l) => l.name.toLowerCase())));
        }
        if (data.companies?.length) {
          setSavedAccountShapes(
            uniqueScoutCompanies(
              data.companies.map((company) => ({
                name: company.name,
                city: "city" in company ? company.city : undefined,
                domain:
                  "domain" in company && company.domain
                    ? company.domain
                    : resolveCompanyDomain(company as never),
              })),
            ),
          );
        }
        if (data.dataMode) setDataMode(data.dataMode);
        if (typeof data.scoutCompaniesLimit === "number") setScoutCompaniesLimit(data.scoutCompaniesLimit);
        if (typeof data.scoutLeadsLimit === "number") setScoutLeadsLimit(data.scoutLeadsLimit);
        if (Array.isArray(data.scoutPeopleCities) && data.scoutPeopleCities.length) {
          setPeopleCities(data.scoutPeopleCities);
        }
        const focuses = data.scoutAreasOfFocus?.length
          ? data.scoutAreasOfFocus
          : data.scoutAreaOfFocus
            ? [data.scoutAreaOfFocus]
            : [];
        if (data.scoutGeo) setScoutGeo(data.scoutGeo);
        const storedScope = parseScoutLocationScope(stored.locationScope);
        const scope = storedScope ?? parseScoutLocationScope(data.scope) ?? defaultScoutLocationScope(focuses);
        setLocationScope(scope);
        const locations =
          scope === "focus"
            ? (data.focusLocations ?? scoutLocationOptions(data.scoutGeo, focuses, "focus"))
            : (data.interestLocations ?? scoutLocationOptions(data.scoutGeo, focuses, "interest"));
        applyLocationOptions(locations, focuses, citiesByScopeRef.current[scope]);
      })
      .catch(() => {
        const fallback = (process.env.NEXT_PUBLIC_DEFAULT_DATA_MODE as DataMode) ?? "free";
        setDataMode(fallback);
        applyLocationOptions(locationOptionsFromSelection(), []);
      })
      .finally(() => setSettingsLoaded(true));
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
    function onScoutVolumeUpdated(e: Event) {
      const detail = (e as CustomEvent<{ scoutCompaniesLimit?: number; scoutLeadsLimit?: number }>).detail;
      if (typeof detail?.scoutCompaniesLimit === "number") setScoutCompaniesLimit(detail.scoutCompaniesLimit);
      if (typeof detail?.scoutLeadsLimit === "number") setScoutLeadsLimit(detail.scoutLeadsLimit);
    }
    function onScoutGeoUpdated(e: Event) {
      const detail = (e as CustomEvent<{ scoutGeo?: ScoutGeoSelection }>).detail;
      void fetch("/api/scout/locations")
        .then((r) => r.json())
        .then((data: {
          locations?: ScoutLocationOption[];
          focusLocations?: ScoutLocationOption[];
          interestLocations?: ScoutLocationOption[];
          scoutGeo?: ScoutGeoSelection;
          scoutAreaOfFocus?: ScoutAreaOfFocus | null;
          scoutAreasOfFocus?: ScoutAreaOfFocus[];
        }) => {
          const focuses = data.scoutAreasOfFocus?.length
            ? data.scoutAreasOfFocus
            : data.scoutAreaOfFocus
              ? [data.scoutAreaOfFocus]
              : [];
          const geo = data.scoutGeo ?? detail?.scoutGeo;
          if (geo) setScoutGeo(geo);
          const scope = locationScopeRef.current;
          const locations =
            scope === "focus"
              ? (data.focusLocations ?? scoutLocationOptions(geo, focuses, "focus"))
              : (data.interestLocations ?? scoutLocationOptions(geo, focuses, "interest"));
          applyLocationOptions(locations, focuses, citiesByScopeRef.current[scope]);
        })
        .catch(() => {
          if (detail?.scoutGeo) {
            setScoutGeo(detail.scoutGeo);
            applyLocationOptions(
              scoutLocationOptions(detail.scoutGeo, null, locationScopeRef.current),
              undefined,
            );
          }
        });
    }
    window.addEventListener("scout-volume-updated", onScoutVolumeUpdated);
    window.addEventListener("scout-geo-updated", onScoutGeoUpdated);
    return () => {
      window.removeEventListener("scout-volume-updated", onScoutVolumeUpdated);
      window.removeEventListener("scout-geo-updated", onScoutGeoUpdated);
    };
  }, []);


  const loadCompanies = useCallback(
    async (
      nextCities: string[],
      nextIndustries: string[],
      nextEmployeeBands: string[],
      options?: {
        append?: boolean;
        skipInternal?: boolean;
        excludeNames?: string[];
        excludeSavedAccounts?: boolean;
        seed?: number;
        forceMainLoader?: boolean;
        companyName?: string;
      },
    ) => {
      const append = options?.append ?? false;
      const setLoading = append && !options?.forceMainLoader ? setLoadingMore : setLoadingCompanies;
      if (!append) setShowingSaved(false);
      setLoading(true);

      try {
        const batchExclude = append ? companies.map((c) => c.name) : [];
        const savedExclude = savedAccountShapes.map((c) => c.name);
        const excludeNames =
          options?.excludeNames ?? [...new Set([...batchExclude, ...savedExclude])];
        const excludeSavedAccounts = options?.excludeSavedAccounts ?? !options?.companyName;
        const seed = options?.seed ?? fetchSeed;
        const requestParams = {
          cities: nextCities,
          industries: nextIndustries,
          dataMode,
          seniority,
          departments,
          excludeNames,
          excludeSavedAccounts,
          skipInternal: options?.skipInternal ?? append,
          fetchSeed: seed,
          limit: scoutCompaniesLimit,
          employeeBands: nextEmployeeBands,
          locationScope: locationScopeRef.current,
          searchKind: verticalScopeRef.current === "businesses" ? "business" as const : "industry" as const,
          ...(options?.companyName ? { companyName: options.companyName } : {}),
        };

        let sawPartial = false;
        const applyCompanies = (rawCompanies: ScoutCompanyResult[], _finalize: boolean) => {
          const freshCompanies = rawCompanies.filter(
            (company) =>
              !scoutCompanyMatchesSaved(
                {
                  name: company.name,
                  city: company.city,
                  domain: resolveCompanyDomain(company),
                },
                savedAccountShapes,
              ),
          );
          const shaped = dedupeCompanyShapes(freshCompanies.map((c, i) => toCompanyShape(c, i)));
          setCompanies((prev) => (append ? mergeCompanies(prev, shaped) : shaped));
          if (!append) {
            setSelectedCompanyIds(new Set(shaped.map((c) => c.id)));
            if (shaped.length && !sawPartial) {
              setPrimaryCompanyId(
                typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches
                  ? shaped[0].id
                  : null,
              );
            } else if (!shaped.length) {
              setPrimaryCompanyId(null);
            }
          } else if (shaped.length) {
            setSelectedCompanyIds((prev) => {
              const next = new Set(prev);
              shaped.forEach((c) => next.add(c.id));
              return next;
            });
          }
          if (shaped.length && !append) {
            sawPartial = true;
            // Clear full-page spinner as soon as first companies land.
            setLoading(false);
            setHasFetched(true);
          }
          return shaped;
        };

        let response: Awaited<ReturnType<typeof scoutCompanies>>;
        try {
          response = await scoutCompaniesStream(requestParams, (event) => {
            if (event.type === "partial" && event.companies.length) {
              applyCompanies(event.companies, false);
            }
          });
        } catch (streamErr) {
          console.warn("[scouting] company stream failed, falling back to JSON:", streamErr);
          response = await scoutCompanies(requestParams);
        }

        const shaped = applyCompanies(response.companies, true);
        setHasMore(response.hasMore);

        if (append && !shaped.length && !response.errors?.length) {
          const helpfulWarning =
            response.warnings?.find((w) =>
              /verified city|already saved|Found \d+ candidate|directory|parse|no companies matched|listings found/i.test(
                w,
              ),
            ) ?? response.warnings?.[0];
          toast.info(
            helpfulWarning ??
              "No additional companies found for these filters. Try other cities or industries.",
          );
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
              /verified city|directory|parse|no companies found|listings found/i.test(w),
            ) ?? response.warnings?.[0];
          setFetchMessage(helpfulWarning ?? null);
        }

        const mergedForSession = append ? mergeCompanies(companies, shaped) : shaped;
        const warnings = response.warnings ?? [];
        if (!append) {
          setPeople([]);
          peopleRef.current = [];
          setSelectedPersonIds(new Set());
          void createSessionFromResults({
            companies: mergedForSession,
            people: [],
            mode: scoutMode,
            filters: buildSessionFilters(
              options?.companyName ? { companyName: options.companyName } : undefined,
            ),
            uiState: {
              selectedCompanyIds: mergedForSession.map((c) => c.id),
              selectedPersonIds: [],
              primaryCompanyId:
                typeof window !== "undefined" &&
                window.matchMedia("(min-width: 1024px)").matches &&
                mergedForSession[0]
                  ? mergedForSession[0].id
                  : null,
              primaryPersonId: null,
              view: "companies",
              fetchSeed: seed,
              hasMore: response.hasMore,
              companySearchQuery: options?.companyName ?? companySearchQuery,
            },
            warnings,
          });
        } else if (activeSessionIdRef.current) {
          void patchActiveSession({
            companies: mergedForSession,
            uiState: {
              selectedCompanyIds: [
                ...new Set([
                  ...selectedCompanyIds,
                  ...shaped.map((c) => c.id),
                ]),
              ],
              selectedPersonIds: [...selectedPersonIds],
              primaryCompanyId,
              primaryPersonId,
              view: "companies",
              fetchSeed: seed,
              hasMore: response.hasMore,
              companySearchQuery,
            },
            warnings,
          });
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
    [
      dataMode,
      companies,
      fetchSeed,
      scoutCompaniesLimit,
      savedAccountShapes,
      scoutMode,
      cities,
      industries,
      businesses,
      employeeBands,
      seniority,
      departments,
      peopleCities,
      locationScope,
      verticalScope,
      companySearchQuery,
      selectedCompanyIds,
      selectedPersonIds,
      primaryCompanyId,
      primaryPersonId,
    ],
  );

  function toggleEmployeeBand(bandId: string) {
    setEmployeeBands((prev) =>
      prev.includes(bandId) ? prev.filter((id) => id !== bandId) : [...prev, bandId],
    );
  }

  function persistNearbyAreaSelection(nextCities: string[], focuses: ScoutAreaOfFocus[]) {
    const nextFocuses = applyNearbyAreaSelectionToFocuses(focuses, nextCities);
    setAreasOfFocus(nextFocuses);
    setLocationOptions((prev) =>
      prev.map((option) =>
        option.kind === "area" ? { ...option, selected: nextCities.includes(option.label) } : option,
      ),
    );
    if (persistAreaSelectionTimer.current) window.clearTimeout(persistAreaSelectionTimer.current);
    persistAreaSelectionTimer.current = window.setTimeout(() => {
      void fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scoutAreasOfFocus: nextFocuses,
          scoutAreaOfFocus: nextFocuses[0] ?? null,
        }),
      }).catch(() => {
        /* session selection still applies */
      });
    }, 400);
  }

  function handleCitiesChange(nextCities: string[]) {
    setCities(nextCities);
    citiesByScopeRef.current[locationScope] = nextCities;
    writeScoutFilterSession({ citiesByScope: { ...citiesByScopeRef.current } });
    if (locationScope === "focus" && areasOfFocus.length && locationOptions.some((option) => option.kind === "area")) {
      persistNearbyAreaSelection(nextCities, areasOfFocus);
    }
  }

  function handleLocationScopeChange(next: ScoutLocationScope) {
    citiesByScopeRef.current[locationScope] = cities;
    setLocationScope(next);
    writeScoutFilterSession({ locationScope: next, citiesByScope: { ...citiesByScopeRef.current } });
    const locations =
      next === "focus"
        ? locationOptionsFromAreaOfFocus(areasOfFocus)
        : locationOptionsFromSelection(scoutGeo);
    applyLocationOptions(locations, undefined, citiesByScopeRef.current[next]);
  }

  function handleVerticalScopeChange(next: ScoutVerticalScope) {
    peopleFiltersByScopeRef.current[verticalScope] = { seniority, departments };
    setVerticalScope(next);
    writeScoutFilterSession({ verticalScope: next });
    if (next === "businesses") {
      setSeniority([]);
      setDepartments([]);
    } else {
      const restored = peopleFiltersByScopeRef.current.industries;
      setSeniority(restored.seniority);
      setDepartments(restored.departments);
    }
  }

  function toggleBusiness(label: string) {
    setBusinesses((prev) => {
      const next = prev.includes(label) ? prev.filter((i) => i !== label) : [...prev, label];
      writeScoutFilterSession({ businesses: next });
      return next;
    });
  }

  function missingLocationToast() {
    toast.error(
      locationScope === "focus"
        ? locationOptions.some((option) => option.kind === "area")
          ? "Select at least one nearby area"
          : "Set Areas of focus in Settings"
        : "Select at least one city",
    );
  }


  function toggleIndustry(ind: string) {
    setIndustries((prev) => {
      const next = prev.includes(ind) ? prev.filter((i) => i !== ind) : [...prev, ind];
      writeScoutFilterSession({ industries: next });
      return next;
    });
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

  function activeDiscoveryTerms() {
    return verticalScope === "businesses" ? businesses : industries;
  }

  function handleFetchNewCompanies() {
    if (!settingsLoaded) {
      toast.error("Still loading settings — try again in a moment.");
      return;
    }
    if (!cities.length) {
      missingLocationToast();
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
    loadCompanies(cities, activeDiscoveryTerms(), employeeBands, {
      append: false,
      skipInternal: true,
      seed: nextSeed,
    });
  }


  function handleRefresh() {
    setSelectedCompanyIds(new Set());
    setFetchSeed(0);
    setDiscoveryNotice(null);
    loadCompanies(cities, activeDiscoveryTerms(), employeeBands, { append: false, skipInternal: true, seed: 0 });
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
      missingLocationToast();
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

    loadCompanies(cities, activeDiscoveryTerms(), employeeBands, {
      append: false,
      skipInternal: false,
      excludeSavedAccounts: false,
      seed: 0,
      companyName: query,
    });
  }

  function handleLoadMore() {
    const nextSeed = fetchSeed + 1;
    setFetchSeed(nextSeed);
    loadCompanies(cities, activeDiscoveryTerms(), employeeBands, {
      append: true,
      skipInternal: true,
      seed: nextSeed,
    });
  }

  function handleScoutMore() {
    setView("companies");
    setSelectedPersonIds(new Set());
    setPrimaryPersonId(null);
    const nextSeed = fetchSeed + 1;
    setFetchSeed(nextSeed);
    loadCompanies(cities, activeDiscoveryTerms(), employeeBands, {
      append: true,
      skipInternal: true,
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

  function companiesForPendingFetch() {
    const ids = pendingFetchIds ?? selectedCompanyIds;
    return companies.filter((c) => ids.has(c.id));
  }

  function beginFetchLeads(selected: CompanyShape[], activeSeniority: string[], activeDepartments: string[]) {
    setShowRolePicker(false);
    setShowFetchRisk(false);
    setPendingFetchIds(null);
    setPendingFetchRoles(null);
    void runFetchLeads(selected, activeSeniority, activeDepartments, {
      coverageCompanyIds: selected.map((c) => c.id),
    });
  }

  function confirmFetchIfRisky(
    selected: CompanyShape[],
    activeSeniority: string[],
    activeDepartments: string[],
  ) {
    const geo = peopleGeoForSavedBatch(selected);
    const risk = assessPeopleFetchRisk({
      companyCount: selected.length,
      cities: geo.cities,
      seniority: activeSeniority,
      departments: activeDepartments,
      searchKind: verticalScope === "businesses" ? "business" : "industry",
      businesses,
      locationScope: geo.locationScope,
    });
    if (!risk.needsConfirm) {
      beginFetchLeads(selected, activeSeniority, activeDepartments);
      return;
    }
    setPendingFetchIds(new Set(selected.map((c) => c.id)));
    setPendingFetchRoles({ seniority: activeSeniority, departments: activeDepartments });
    setShowFetchRisk(true);
  }

  function handleFetchLeads() {
    const selected = companies.filter((c) => selectedCompanyIds.has(c.id));
    if (!selected.length) return;

    if (verticalScope === "businesses") {
      setSeniority([]);
      setDepartments([]);
      beginFetchLeads(selected, [], []);
      return;
    }

    setPendingFetchIds(new Set(selected.map((c) => c.id)));
    setShowRolePicker(true);
  }

  function handleRolePickerConfirm(chosenSeniority: string[], chosenDepartments: string[], chosenPeopleCities: string[]) {
    setSeniority(chosenSeniority);
    setDepartments(chosenDepartments);
    setPeopleCities(chosenPeopleCities);
    setShowRolePicker(false);
    confirmFetchIfRisky(companiesForPendingFetch(), chosenSeniority, chosenDepartments);
  }

  function handleFetchRiskCancel() {
    setShowFetchRisk(false);
    setPendingFetchIds(null);
    setPendingFetchRoles(null);
  }

  function handleFetchWithoutPeopleFilters() {
    setSeniority([]);
    setDepartments([]);
    beginFetchLeads(companiesForPendingFetch(), [], []);
  }

  function handleFetchAnyway() {
    const roles = pendingFetchRoles ?? { seniority, departments };
    beginFetchLeads(companiesForPendingFetch(), roles.seniority, roles.departments);
  }

  function handleUseSuggestedFilters() {
    const roles = pendingFetchRoles ?? { seniority, departments };
    const selected = companiesForPendingFetch();
    const geo = peopleGeoForSavedBatch(selected);
    const risk = assessPeopleFetchRisk({
      companyCount: selected.length,
      cities: geo.cities,
      seniority: roles.seniority,
      departments: roles.departments,
      searchKind: verticalScope === "businesses" ? "business" : "industry",
      businesses,
      locationScope: geo.locationScope,
    });
    if (!risk.suggestedFilters) return;
    setSeniority(risk.suggestedFilters.seniority);
    setDepartments(risk.suggestedFilters.departments);
    beginFetchLeads(
      selected,
      risk.suggestedFilters.seniority,
      risk.suggestedFilters.departments,
    );
  }

  async function handleSaveCompanies() {
    const selected = companies.filter((c) => selectedCompanyIds.has(c.id));
    if (!selected.length || savingCompanies) return;
    setSavingCompanies(true);
    try {
      const result = await scoutSaveCompanies({
        companies: selected.map((c) => c._raw),
        dataMode,
      });
      setSavedAccountShapes((prev) =>
        uniqueScoutCompanies([
          ...prev,
          ...selected.map((company) => ({
            name: company.name,
            city: company.city,
            domain: company.domain ?? resolveCompanyDomain(company._raw),
          })),
        ]),
      );
      toast.success(`Saved ${result.saved} companies.`, {
        action: {
          label: "Extract leads",
          onClick: () => {
            void handleShowSaved();
          },
        },
      });
      notifyCrmRecordsChanged({ source: "scout_save_companies", savedAccounts: result.saved });
    } catch (e) {
      toast.error("Could not save companies. Try again.");
      console.error(e);
    } finally {
      setSavingCompanies(false);
    }
  }

  async function handleShowSaved() {
    clearActiveSession();
    setView("companies");
    setShowingSaved(true);
    setHasMore(false);
    setDiscoveryNotice(null);
    setFetchMessage(null);
    setPeople([]);
    setSelectedPersonIds(new Set());
    setOverflowOpen(false);
    setFiltersExpanded(false);
    setLoadingCompanies(true);
    try {
      const data = await scoutSavedCompanies();
      const shaped = dedupeCompanyShapes(data.companies.map((c, i) => toCompanyShape(c, i)));
      setCompanies(shaped);
      // Pre-select so Extract leads is ready immediately.
      setSelectedCompanyIds(new Set(shaped.map((c) => c.id)));
      setPrimaryCompanyId(
        shaped.length && typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches
          ? shaped[0].id
          : null,
      );
      setHasFetched(true);
    } catch (e) {
      toast.error("Could not load saved companies. Try again.");
      console.error(e);
    } finally {
      setLoadingCompanies(false);
    }
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

  function applyResolvedCompanyDomain(companyId: string, domain?: string, website?: string) {
    if (!domain && !website) return;
    setCompanies((prev) =>
      prev.map((c) => {
        if (c.id !== companyId) return c;
        return {
          ...c,
          domain: domain ?? c.domain,
          website: website ?? c.website,
          _raw: {
            ...c._raw,
            domain: domain ?? c._raw.domain,
            website: website ?? c._raw.website,
          },
        };
      }),
    );
  }

  async function handlePastedWebsites(entries: WebsitePasteEntry[]) {
    if (!entries.length) return;

    const updatedCompanies: CompanyShape[] = [];
    const statusPatch: Record<string, WebsiteRowStatus> = {};
    const idSet = new Set<string>();

    for (const entry of entries) {
      const company = companies.find((c) => c.id === entry.companyId);
      if (!company) continue;
      const parsed = parsePastedCompanyWebsite(entry.website);
      if (!parsed.domain) {
        statusPatch[entry.companyId] = "error";
        continue;
      }
      applyResolvedCompanyDomain(company.id, parsed.domain, parsed.website);
      updatedCompanies.push({
        ...company,
        domain: parsed.domain,
        website: parsed.website,
        _raw: { ...company._raw, domain: parsed.domain, website: parsed.website },
      });
      idSet.add(company.id);
      statusPatch[company.id] = "queued";
    }

    if (!updatedCompanies.length) {
      toast.error("Use the company website (company.com). Zauba and IndiaMART pages are not accepted.");
      setWebsiteRowStatus((prev) => ({ ...prev, ...statusPatch }));
      return;
    }

    setWebsiteRowStatus((prev) => ({ ...prev, ...statusPatch }));
    setApplyingWebsites(true);
    setApplyingWebsiteIds(idSet);
    for (const id of idSet) {
      statusPatch[id] = "fetching";
    }
    setWebsiteRowStatus((prev) => ({ ...prev, ...statusPatch }));

    try {
      await runFetchLeads(updatedCompanies, seniority, departments, {
        append: peopleRef.current.length > 0,
        coverageCompanyIds: [...selectedCompanyIds],
      });

      setWebsiteRowStatus((prev) => {
        const next = { ...prev };
        const foundCompanyIds = new Set(
          peopleRef.current
            .filter((p) => idSet.has(p.companyId))
            .map((p) => p.companyId),
        );
        for (const id of idSet) {
          next[id] = foundCompanyIds.has(id) ? "done" : "no_match";
        }
        return next;
      });
    } finally {
      setApplyingWebsites(false);
      setApplyingWebsiteIds(new Set());
    }
  }

  function peopleGeoForSavedCompany(company: CompanyShape): {
    cities: string[];
    peopleCities: string[];
    locationScope: "focus" | "interest";
  } {
    if (!showingSavedRef.current) {
      return {
        cities,
        peopleCities,
        locationScope: locationScope === "focus" ? "focus" : "interest",
      };
    }
    const city = company.city?.trim() || company._raw.city?.trim() || "";
    const cityList = city ? [city] : [];
    return {
      cities: cityList,
      peopleCities: cityList,
      // Saved companies keep their own city; do not apply Focus Area neighborhood filters.
      locationScope: "interest",
    };
  }

  function peopleGeoForSavedBatch(selected: CompanyShape[]): {
    cities: string[];
    peopleCities: string[];
    locationScope: "focus" | "interest";
  } {
    if (!showingSavedRef.current) {
      return {
        cities,
        peopleCities,
        locationScope: locationScope === "focus" ? "focus" : "interest",
      };
    }
    const cityList = [
      ...new Set(
        selected
          .map((c) => c.city?.trim() || c._raw.city?.trim() || "")
          .filter(Boolean),
      ),
    ];
    return {
      cities: cityList,
      peopleCities: cityList,
      locationScope: "interest",
    };
  }

  async function fetchLeadsParallel(
    selected: CompanyShape[],
    activeSeniority: string[],
    activeDepartments: string[],
    allPeople: ReturnType<typeof toPersonShape>[],
    peopleWarnings: string[],
  ) {
    let doneCount = 0;
    await mapWithConcurrency(selected, 8, async (company) => {
      try {
        const geo = peopleGeoForSavedCompany(company);
        const { people: results, warnings, errors, resolvedDomain, resolvedWebsite } = await scoutPeople({
          companyName: company.name,
          companyDomain: resolveCompanyDomain(company._raw),
          companyWebsite: company._raw.website,
          dataMode,
          limit: peoplePerCompanyLimit(scoutLeadsLimit),
          seniority: activeSeniority,
          departments: activeDepartments,
          cities: geo.cities,
          peopleCities: geo.peopleCities,
          searchKind: verticalScope === "businesses" ? "business" : "industry",
          businesses,
          locationScope: geo.locationScope,
        });
        applyResolvedCompanyDomain(company.id, resolvedDomain, resolvedWebsite);
        peopleWarnings.push(...(warnings ?? []), ...(errors ?? []));
        const shaped = results.map((p, j) => toPersonShape(p, company.id, j));
        allPeople.push(...shaped);
        setPeople((prev) => {
          const seen = new Set(prev.map((p) => p.id));
          return [...prev, ...shaped.filter((p) => !seen.has(p.id))];
        });
      } catch (e) {
        peopleWarnings.push(
          e instanceof Error ? e.message : `People search failed for ${company.name}`,
        );
      } finally {
        doneCount += 1;
        setFetchProgress({ done: doneCount, total: selected.length });
      }
    });
  }

  async function runFetchLeads(
    selected: CompanyShape[],
    activeSeniority: string[],
    activeDepartments: string[],
    opts?: { append?: boolean; coverageCompanyIds?: string[] },
  ) {
    const append = Boolean(opts?.append);
    const priorPeople = append ? [...peopleRef.current] : [];
    const priorIds = new Set(priorPeople.map((p) => p.id));
    const priorSelected = append ? new Set(selectedPersonIdsRef.current) : new Set<string>();
    const priorPrimary = append ? primaryPersonIdRef.current : null;

    setView("people");
    setLoadingPeople(true);
    setFetchProgress({ done: 0, total: selected.length });
    if (!append) {
      setPeople([]);
      setPeopleNotice(null);
      setSelectedPersonIds(new Set());
      setPrimaryPersonId(null);
    }

    const leadsDedupePromise = fetch("/api/leads/dedupe")
      .then((res) => res.json())
      .catch(() => null);

    try {
      const allPeople: ReturnType<typeof toPersonShape>[] = append ? [...priorPeople] : [];
      const peopleWarnings: string[] = [];
      const incomingIds = new Set<string>();

      if (selected.length > 1) {
        try {
          let doneCount = 0;
          const batchGeo = peopleGeoForSavedBatch(selected);
          await scoutPeopleBatchStream(
            {
              companies: selected.map((c) => ({
                id: c.id,
                name: c.name,
                domain: resolveCompanyDomain(c._raw),
                website: c._raw.website,
              })),
              dataMode,
              limit: peoplePerCompanyLimit(scoutLeadsLimit),
              seniority: activeSeniority,
              departments: activeDepartments,
              cities: batchGeo.cities,
              peopleCities: batchGeo.peopleCities,
              searchKind: verticalScope === "businesses" ? "business" : "industry",
              businesses,
              locationScope: batchGeo.locationScope,
            },
            (companyId, batchResult) => {
              const company = selected.find((c) => c.id === companyId);
              if (!company) return;
              applyResolvedCompanyDomain(company.id, batchResult.resolvedDomain, batchResult.resolvedWebsite);
              peopleWarnings.push(...(batchResult.warnings ?? []), ...(batchResult.errors ?? []));
              const shaped = batchResult.people.map((p, j) => toPersonShape(p, company.id, j));
              for (const person of shaped) incomingIds.add(person.id);
              allPeople.push(...shaped);
              doneCount += 1;
              setFetchProgress({ done: doneCount, total: selected.length });
              setPeople((prev) => {
                const seen = new Set(prev.map((p) => p.id));
                return [...prev, ...shaped.filter((p) => !seen.has(p.id))];
              });
            },
          );
        } catch (batchErr) {
          const message = batchErr instanceof Error ? batchErr.message : String(batchErr);
          if (/insufficient credits/i.test(message)) {
            peopleWarnings.push(message);
            toast.error(message);
          } else {
            console.warn("[scouting] batch fetch failed, falling back to parallel singles:", batchErr);
            const beforeLen = allPeople.length;
            await fetchLeadsParallel(selected, activeSeniority, activeDepartments, allPeople, peopleWarnings);
            for (const person of allPeople.slice(beforeLen)) incomingIds.add(person.id);
          }
        }
      } else {
        const beforeLen = allPeople.length;
        await fetchLeadsParallel(selected, activeSeniority, activeDepartments, allPeople, peopleWarnings);
        for (const person of allPeople.slice(beforeLen)) incomingIds.add(person.id);
      }

      void leadsDedupePromise.then((leadsData) => {
        if (leadsData) applyLeadsDedupe(leadsData);
      });

      // Dedupe by id, then cap — but never drop people already on screen mid-session.
      const deduped: ReturnType<typeof toPersonShape>[] = [];
      const seenIds = new Set<string>();
      for (const person of allPeople) {
        if (seenIds.has(person.id)) continue;
        seenIds.add(person.id);
        deduped.push(person);
      }
      const capped = capFetchedPeople(deduped, scoutLeadsLimit);
      const cappedById = new Map(capped.map((p) => [p.id, p]));
      if (append) {
        for (const person of priorPeople) {
          cappedById.set(person.id, person);
        }
      }
      const cappedPeople = [...cappedById.values()];
      setPeople(cappedPeople);
      peopleRef.current = cappedPeople;

      const coverageIds =
        opts?.coverageCompanyIds?.length
          ? opts.coverageCompanyIds
          : selected.map((c) => c.id);
      const coverage = scoutPeopleCoverage({
        selectedCompanyIds: coverageIds,
        people: cappedPeople,
      });

      if (cappedPeople[0]) {
        if (append) {
          const nextSelected = new Set(priorSelected);
          for (const person of cappedPeople) {
            if (!incomingIds.has(person.id) && !priorIds.has(person.id)) continue;
            if (priorIds.has(person.id)) {
              if (priorSelected.has(person.id)) nextSelected.add(person.id);
              continue;
            }
            if (!existingContactNames.has(person.name.toLowerCase())) {
              nextSelected.add(person.id);
            }
          }
          for (const id of [...nextSelected]) {
            if (!cappedById.has(id)) nextSelected.delete(id);
          }
          setSelectedPersonIds(nextSelected);
          if (priorPrimary && cappedById.has(priorPrimary)) {
            setPrimaryPersonId(priorPrimary);
          } else if (
            typeof window !== "undefined" &&
            window.matchMedia("(min-width: 1024px)").matches &&
            !priorPrimary
          ) {
            setPrimaryPersonId(cappedPeople[0].id);
          }
        } else {
          if (typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches) {
            setPrimaryPersonId(cappedPeople[0].id);
          } else {
            setPrimaryPersonId(null);
          }
          setSelectedPersonIds(
            new Set(
              cappedPeople
                .filter((p) => !existingContactNames.has(p.name.toLowerCase()))
                .map((p) => p.id),
            ),
          );
        }

        if (coverage.companiesWithoutPeople > 0) {
          setPeopleNotice({
            headline: `Leads from ${coverage.companiesWithPeople} of ${coverage.totalCompanies} companies`,
            detail: `Found ${cappedPeople.length} decision-maker${cappedPeople.length === 1 ? "" : "s"} at ${coverage.companiesWithPeople} of ${coverage.totalCompanies} companies. ${coverage.companiesWithoutPeople} had no match for your People filters or cities.`,
          });
          if (!append) {
            toast.message(
              `Found people at ${coverage.companiesWithPeople}/${coverage.totalCompanies} companies`,
              { description: `${coverage.companiesWithoutPeople} companies returned no matching roles.` },
            );
          }
        } else {
          setPeopleNotice(null);
        }
      } else {
        const notice = pickPeopleNotice(peopleWarnings, selected.length, {
          cities,
          seniority: activeSeniority,
          departments: activeDepartments,
          platformIntent,
          searchKind: verticalScope === "businesses" ? "business" : "industry",
        });
        setPeopleNotice(notice);
        const switchMsg = peopleWarnings.find((w) => /switched to (?:backup|next) key/i.test(w));
        if (switchMsg) {
          const key = noticeKey(switchMsg);
          if (!shownNoticesRef.current.has(key)) {
            shownNoticesRef.current.add(key);
            toast.info(switchMsg);
          }
        }
        const errorMsg = pickPrimaryNotice(peopleWarnings);
        if (errorMsg && /insufficient credits|missing|exhausted|quota|usage limit|people search needs tavily/i.test(errorMsg)) {
          const key = noticeKey(errorMsg);
          if (!shownNoticesRef.current.has(key)) {
            shownNoticesRef.current.add(key);
            toast.error(errorMsg);
          }
        } else if (!peopleWarnings.length) {
          toast.info(notice.detail);
        }
      }

      if (activeSessionIdRef.current) {
        const nextSelected =
          cappedPeople.length === 0
            ? []
            : cappedPeople
                .filter((p) => !existingContactNames.has(p.name.toLowerCase()))
                .map((p) => p.id);
        void patchActiveSession({
          companies,
          people: cappedPeople,
          uiState: {
            selectedCompanyIds: [...selectedCompanyIds],
            selectedPersonIds: nextSelected,
            primaryCompanyId,
            primaryPersonId: cappedPeople[0]?.id ?? null,
            view: "people",
            fetchSeed,
            hasMore,
            companySearchQuery,
          },
        });
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

      setSaveProgress({ done: 0, total: selectedPeople.length });

      const batchCompanies = [...byCompany.entries()]
        .map(([companyId, persons]) => {
          const company = companies.find((c) => c.id === companyId);
          if (!company) return null;
          return {
            id: companyId,
            company: company._raw,
            people: persons.map((p) => p._raw),
            personCount: persons.length,
          };
        })
        .filter((c): c is NonNullable<typeof c> => Boolean(c));

      const advanceProgress = (personCount: number) => {
        setSaveProgress((prev) => ({
          ...prev,
          done: Math.min(prev.total, prev.done + personCount),
        }));
      };

      try {
        await scoutSaveBatchStream(
          {
            companies: batchCompanies.map(({ id, company, people: batchPeople }) => ({
              id,
              company,
              people: batchPeople,
            })),
            dataMode,
          },
          (result) => {
            totalSaved += result.saved.length;
            allSkipped.push(...result.skipped);
            const entry = batchCompanies.find((c) => c.id === result.id);
            advanceProgress(entry?.personCount ?? result.saved.length + result.skipped.length);
          },
        );
      } catch (batchErr) {
        console.warn("[handleAddLeads] batch stream failed, falling back", batchErr);
        setSaveProgress({ done: 0, total: selectedPeople.length });
        totalSaved = 0;
        allSkipped.length = 0;

        await mapWithConcurrency(batchCompanies, 3, async (entry) => {
          const result = await scoutSave({
            people: entry.people,
            company: entry.company,
            dataMode,
          });
          totalSaved += result.saved.length;
          allSkipped.push(...result.skipped);
          advanceProgress(entry.personCount);
        });
      }

      if (totalSaved > 0) {
        toast.success(
          `${totalSaved} lead${totalSaved > 1 ? "s" : ""} saved — updated Leads, Accounts, and Contacts`,
        );
        notifyCrmRecordsChanged({ source: "scout_add_leads", savedLeads: totalSaved });
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
    employeeBands,
    seniority,
    departments,
    selectedCount: view === "companies" ? selectedCompanyIds.size : selectedPersonIds.size,
    settingsLoaded,
    scoutCompaniesLimit,
    scoutLeadsLimit,
    loadingCompanies,
    loadingMore,
    loadingPeople,
    saving,
    savingCompanies,
    showingSaved,
    scoutMode,
    companySearchQuery,
    onCitiesChange: handleCitiesChange,
    onIndustryToggle: toggleIndustry,
    onEmployeeBandToggle: toggleEmployeeBand,
    onSeniorityToggle: toggleSeniority,
    onDepartmentToggle: toggleDepartment,
    onFetchNewCompanies: handleFetchNewCompanies,
    onFetchLeads: handleFetchLeads,
    onSaveCompanies: handleSaveCompanies,
    onShowSaved: handleShowSaved,
    onShowHistory: () => setHistoryOpen(true),
    activeSessionTitle,
    onAddLeads: handleAddLeads,
    onScoutMore: handleScoutMore,
    onLoadMore: handleLoadMore,
    onRefresh: handleRefresh,
    onScoutModeChange: handleScoutModeChange,
    onCompanySearchQueryChange: setCompanySearchQuery,
    onSearchByName: handleSearchByName,
    onFilterPanelChange: setFilterPanelOpen,
    locationOptions,
    locationScope,
    onLocationScopeChange: handleLocationScopeChange,
    verticalScope,
    onVerticalScopeChange: handleVerticalScopeChange,
    businesses,
    onBusinessToggle: toggleBusiness,
  } as const;

  const missingWebsiteCompanies = companies
    .filter((c) => selectedCompanyIds.has(c.id) && companyNeedsOfficialWebsite(c))
    .map((c) => ({ id: c.id, name: c.name }));

  const companiesResults = view === "companies" ? (
    loadingCompanies ? (
      <DiscoveringLoader
        message={showingSaved ? "Loading saved companies" : undefined}
        hints={
          showingSaved
            ? ["Loading saved companies"]
            : [
                cities.length ? `Scanning ${cities.join(", ")}` : "Scanning company directories",
                activeDiscoveryTerms().length
                  ? `Filtering ${activeDiscoveryTerms().join(", ")}`
                  : verticalScope === "businesses"
                    ? "Matching all businesses"
                    : "Matching all industries",
                employeeBands.length
                  ? `Matching ${SCOUT_EMPLOYEE_BANDS.filter((b) => employeeBands.includes(b.id)).map((b) => b.label).join(", ")}`
                  : "Any company scale",
                icpHint ? `Buyers: ${icpHint}` : "Ranking by fit for outreach",
              ]
        }
      />
    ) : companies.length === 0 && (!filterPanelOpen || showingSaved) ? (
      <ScoutCompaniesEmpty
        hasFetched={hasFetched}
        scoutMode={scoutMode}
        fetchMessage={fetchMessage}
        showingSaved={showingSaved}
        icpHint={icpHint}
        locationScope={locationScope}
      />
    ) : companies.length === 0 ? (
      null
    ) : (
      <>
        {discoveryNotice && !showingSaved ? (
          <div className="mx-4 mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] leading-snug text-amber-950 lg:mx-5">
            {discoveryNotice}
          </div>
        ) : null}
        {showingSaved && companies.length > 0 ? (
          <div className="mx-4 mt-2 rounded-xl border border-brand-stratus-blue/20 bg-brand-stratus-blue/5 px-3 py-2 text-[12px] leading-snug text-brand-ink-soft lg:mx-5">
            Saved companies are pre-selected. Tap <span className="font-semibold text-brand-ink">Extract leads</span> to find decision-makers at each company (uses that company&apos;s city, not your Scout city filter).
          </div>
        ) : null}
        {isMobileLayout && scoutCompaniesLimit <= 1 && companies.length > 0 && !showingSaved ? (
          <div className="mx-3 mt-2 rounded-xl border border-brand-stratus-blue/20 bg-brand-canvas/80 px-3 py-2 text-[12px] leading-snug text-brand-ink-soft">
            1 company per scout batch. Tap <span className="font-semibold text-brand-ink">Load more</span> in the menu, or raise the limit in Settings.
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-3 px-4 py-2 lg:px-5">
          <div className="min-w-0 text-[11px] font-semibold uppercase tracking-wide text-brand-ink-faint">
            {showingSaved ? (
              <>
                {companies.length} saved compan{companies.length === 1 ? "y" : "ies"}
                {selectedCompanyIds.size > 0 ? ` · ${selectedCompanyIds.size} selected` : ""}
              </>
            ) : (
              <>
                {companies.length} {scoutMode === "search" ? "result" : "compan"}{companies.length === 1 ? (scoutMode === "search" ? "" : "y") : (scoutMode === "search" ? "s" : "ies")}
                {scoutMode === "search" && companySearchQuery ? ` · "${companySearchQuery}"` : ""}
                {" · "}{cities.join(", ")}
                {activeDiscoveryTerms().length > 0
                  ? ` · ${activeDiscoveryTerms().join(", ")}`
                  : scoutMode === "autopilot"
                    ? verticalScope === "businesses"
                      ? " · all businesses"
                      : " · all industries"
                    : ""}
                {employeeBands.length > 0
                  ? ` · ${SCOUT_EMPLOYEE_BANDS.filter((b) => employeeBands.includes(b.id)).map((b) => b.label).join(", ")}`
                  : ""}
                {selectedCompanyIds.size > 0 ? ` · ${selectedCompanyIds.size} selected` : ""}
              </>
            )}
          </div>
          <button
            type="button"
            onClick={allCompaniesSelected ? deselectAllCompanies : selectAllCompanies}
            className="shrink-0 rounded-full border border-brand-border bg-white px-3 py-1 text-[11px] font-semibold text-brand-ink shadow-[var(--shadow-brand-sm)] transition-colors hover:bg-brand-app"
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
        {hasMore && !isMobileLayout && !showingSaved ? (
          <div className="flex justify-center py-4">
            <button
              type="button"
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="rounded-xl border border-brand-border bg-white px-5 py-2 text-[12px] font-semibold text-brand-ink shadow-[var(--shadow-brand-sm)] hover:bg-brand-app disabled:opacity-50"
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
        className="mb-2 ml-3 flex items-center gap-1.5 text-[12px] font-semibold text-brand-ink-soft hover:text-brand-ink"
      >
        ← Back to Companies
      </button>
      <div className="mb-2 flex items-center justify-between gap-3 px-3">
        <div className="min-w-0 text-[11px] font-semibold uppercase tracking-wide text-brand-ink-faint">
          {people.length} Decision-Makers · {selectedCompanyIds.size}{" "}
          {selectedCompanyIds.size === 1 ? "Company" : "Companies"}
          {selectedPersonIds.size > 0 ? ` · ${selectedPersonIds.size} selected` : ""}
        </div>
        {people.length > 0 ? (
          <button
            type="button"
            onClick={allPeopleSelected ? deselectAllPeople : selectAllPeople}
            disabled={loadingPeople && people.length === 0}
            className="shrink-0 rounded-full border border-brand-border bg-white px-3 py-1 text-[11px] font-semibold text-brand-ink shadow-[var(--shadow-brand-sm)] transition-colors hover:bg-brand-app disabled:opacity-50"
          >
            {allPeopleSelected ? "Deselect all" : "Select all"}
          </button>
        ) : null}
      </div>
      {people.length > 0 && peopleNotice ? (
        <div className="mx-3 mb-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] leading-snug text-amber-950">
          <span className="font-semibold">{peopleNotice.headline}.</span> {peopleNotice.detail}
        </div>
      ) : null}
      {people.length > 0 && missingWebsiteCompanies.length > 0 ? (
        <div className="mx-3 mb-2">
          <MissingWebsitePrompt
            companies={missingWebsiteCompanies}
            applying={applyingWebsites}
            applyingIds={applyingWebsiteIds}
            rowStatus={websiteRowStatus}
            onFetch={handlePastedWebsites}
            compact
          />
        </div>
      ) : null}
      {loadingPeople && people.length > 0 ? (
        <div className="mx-3 mb-2 flex items-center gap-2 rounded-xl border border-brand-stratus-blue/25 bg-brand-stratus-blue/8 px-3 py-2 text-[12px] font-semibold text-brand-ink">
          <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-brand-stratus-blue" />
          {fetchProgress.total > 1
            ? `Finding people · ${fetchProgress.done} of ${fetchProgress.total} companies`
            : "Finding decision-makers…"}
        </div>
      ) : null}
      {saving && people.length > 0 ? (
        <div className="mx-3 mb-2 flex items-center gap-2 rounded-xl border border-brand-stratus-blue/25 bg-white px-3 py-2 text-[12px] font-semibold text-brand-ink shadow-[var(--shadow-brand-sm)]">
          <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-brand-stratus-blue" />
          Saving leads
          {saveProgress.total > 0
            ? ` · ${saveProgress.done} of ${saveProgress.total}`
            : selectedPersonIds.size > 0
              ? ` · ${selectedPersonIds.size}`
              : ""}
        </div>
      ) : null}
      {loadingPeople && people.length === 0 ? (
        <DiscoveringLoader
          message={
            fetchProgress.total > 1
              ? `Finding decision-makers (${fetchProgress.done} of ${fetchProgress.total} companies)`
              : "Finding decision-makers"
          }
          progress={fetchProgress.total > 0 ? fetchProgress : undefined}
          hints={[
            "Searching LinkedIn for decision-makers",
            "Matching seniority & titles",
            "Streaming results as each company finishes",
          ]}
          compact
        />
      ) : people.length === 0 ? (
        <ScoutPeopleEmpty
          headline={peopleNotice?.headline ?? "No decision-makers found"}
          detail={peopleNotice?.detail ?? "Try companies with websites or well-known brands."}
          missingWebsites={missingWebsiteCompanies}
          applyingWebsites={applyingWebsites}
          websiteRowStatus={websiteRowStatus}
          onFetchWebsites={handlePastedWebsites}
        />
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
          getCompanyName={(p) => companies.find((c) => c.id === p.companyId)?.name}
          compact={isMobileLayout}
        />
      )}
    </div>
  );

  const rolePicker = showRolePicker ? (
    <RolePickerModal
      initialSeniority={seniority}
      initialDepartments={departments}
      initialPeopleCities={peopleCities}
      platformIntent={platformIntent}
      verticalScope={verticalScope}
      onConfirm={handleRolePickerConfirm}
      onSkip={() => { setPeopleCities([]); beginFetchLeads(companiesForPendingFetch(), [], []); }}
    />
  ) : null;

  const fetchRiskConfirm =
    showFetchRisk && pendingFetchRoles ? (
      <FetchLeadsRiskModal
        companyCount={companiesForPendingFetch().length}
        cities={cities}
        seniority={pendingFetchRoles.seniority}
        departments={pendingFetchRoles.departments}
        searchKind={verticalScope}
        locationScope={locationScope}
        onCancel={handleFetchRiskCancel}
        onUseSuggestedFilters={handleUseSuggestedFilters}
        onFetchWithoutFilters={handleFetchWithoutPeopleFilters}
        onFetchAnyway={handleFetchAnyway}
      />
    ) : null;

  const scoutModals = (
    <>
      {rolePicker}
      {fetchRiskConfirm}
      <ScoutHistoryPanel
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        activeSessionId={activeSessionId}
        onOpen={openScoutSessionById}
        onDeleted={(id) => {
          if (id === activeSessionIdRef.current) {
            clearActiveSession();
            const params = new URLSearchParams(searchParams.toString());
            params.delete("session");
            const qs = params.toString();
            router.replace(qs ? `${pathname}?${qs}` : pathname);
          }
        }}
      />
    </>
  );

  const mobilePrimaryLabel = (() => {
    if (view === "people") {
      if (saving) return "Saving…";
      if (selectedPersonIds.size > 0) return `Add ${selectedPersonIds.size} as Leads`;
      return "Select people to save";
    }
    if (selectedCompanyIds.size > 0) {
      return showingSaved
        ? `Extract leads · ${selectedCompanyIds.size}`
        : `Fetch Leads · ${selectedCompanyIds.size}`;
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
              <CompanyDetailPanel
                company={primaryCompany}
                decisionMakerHint={primaryCompanyDecisionMaker}
                decisionMakerLeadId={primaryCompanyDecisionMakerLeadId}
                onWebsiteResolved={(resolved) =>
                  applyResolvedCompanyDomain(primaryCompany.id, resolved.domain, resolved.website)
                }
              />
            ) : view === "people" && primaryPerson ? (
              <PersonDetailPanel
                person={primaryPerson}
                index={primaryPersonIndex}
                companyName={companies.find((c) => c.id === primaryPerson.companyId)?.name}
                companyWebsite={companies.find((c) => c.id === primaryPerson.companyId)?.website}
                companyDomain={companies.find((c) => c.id === primaryPerson.companyId)?.domain}
                onWebsiteResolved={(resolved) => {
                  const cid = primaryPerson.companyId;
                  if (cid) applyResolvedCompanyDomain(cid, resolved.domain, resolved.website);
                }}
              />
            ) : null}
          </div>
        </div>
        {scoutModals}
      </>
    );
  }

  if (isMobileLayout) {
    return (
      <>
        <MobilePageLayout
          title="Scouting"
          largeTitle
          className="ish-scout-page lg:hidden"
          contentClassName="!pb-0"
          rightSlot={
            <button
              type="button"
              onClick={() => setOverflowOpen(true)}
              className="flex size-10 items-center justify-center rounded-full bg-white/90 text-brand-ink shadow-ish ring-1 ring-brand-border/40 active:scale-95"
              aria-label="More actions"
            >
              <MoreVertical className="size-4 text-brand-stratus-blue" />
            </button>
          }
          footer={
            <ActionBar>
              {view === "companies" && selectedCompanyIds.size > 0 && !showingSaved ? (
                <button
                  type="button"
                  onClick={() => {
                    setFiltersExpanded(false);
                    void handleSaveCompanies();
                  }}
                  disabled={savingCompanies}
                  className="flex h-12 shrink-0 items-center justify-center gap-2 rounded-2xl border border-brand-border/70 bg-white px-4 text-[14px] font-bold text-brand-ink shadow-brand-sm transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <BookmarkPlus className="size-4 text-brand-stratus-blue" />
                  {savingCompanies ? "Saving…" : "Save companies"}
                </button>
              ) : null}
              <button
                type="button"
                onClick={mobilePrimaryAction}
                disabled={mobilePrimaryDisabled}
                className={cn(
                  "flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl text-[15px] font-bold transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50",
                  mobilePrimaryColor === "yellow" && !mobilePrimaryDisabled &&
                    "bg-brand-yellow-gradient text-brand-black shadow-brand-yellow-sm",
                  mobilePrimaryColor === "green" && !mobilePrimaryDisabled &&
                    "bg-brand-green text-white shadow-[var(--shadow-brand)]",
                  mobilePrimaryDisabled && "bg-brand-canvas text-brand-ink-faint",
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
              className="flex min-h-[48px] items-center gap-3 rounded-2xl border border-brand-border/60 bg-white px-4 text-left text-[14px] font-semibold text-brand-ink active:scale-[0.99]"
            >
              <Search className="size-4 text-brand-stratus-blue" />
              Switch to {scoutMode === "autopilot" ? "Search mode" : "Autopilot"}
            </button>
            {view === "companies" ? (
              <button
                type="button"
                onClick={() => {
                  void handleShowSaved();
                }}
                disabled={loadingCompanies}
                className="flex min-h-[48px] items-center gap-3 rounded-2xl border border-brand-border/60 bg-white px-4 text-left text-[14px] font-semibold text-brand-ink active:scale-[0.99] disabled:opacity-50"
              >
                <Bookmark className="size-4 text-brand-stratus-blue" />
                Saved companies
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setHistoryOpen(true);
                setOverflowOpen(false);
              }}
              className="flex min-h-[48px] items-center gap-3 rounded-2xl border border-brand-border/60 bg-white px-4 text-left text-[14px] font-semibold text-brand-ink active:scale-[0.99]"
            >
              <History className="size-4 text-brand-stratus-blue" />
              Scout history
            </button>
            {scoutMode === "autopilot" && view === "companies" ? (
              <>
                <button
                  type="button"
                  onClick={() => { handleRefresh(); setOverflowOpen(false); }}
                  disabled={loadingCompanies || cities.length === 0}
                  className="flex min-h-[48px] items-center gap-3 rounded-2xl border border-brand-border/60 bg-white px-4 text-left text-[14px] font-semibold text-brand-ink active:scale-[0.99] disabled:opacity-50"
                >
                  Refresh results
                </button>
                <button
                  type="button"
                  onClick={() => { handleLoadMore(); setOverflowOpen(false); }}
                  disabled={loadingMore || !hasMore || showingSaved}
                  className="flex min-h-[48px] items-center gap-3 rounded-2xl border border-brand-border/60 bg-white px-4 text-left text-[14px] font-semibold text-brand-ink active:scale-[0.99] disabled:opacity-50"
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
                className="flex min-h-[48px] items-center gap-3 rounded-2xl border border-brand-border/60 bg-white px-4 text-left text-[14px] font-semibold text-brand-ink active:scale-[0.99] disabled:opacity-50"
              >
                <Compass className="size-4 text-brand-stratus-blue" />
                {loadingMore ? "Scouting more…" : "Scout more companies"}
              </button>
            ) : null}
          </div>
        </BottomSheet>
        {scoutModals}
      </>
    );
  }

  return (
    <>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <AppPageHeader
          icon={Telescope}
          title="Scouting"
        />
        <ScoutingToolbar {...toolbarProps} />
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <div className="min-w-0 flex-1 overflow-y-auto bg-white/40">{companiesResults}</div>
          <div className="hidden w-[360px] shrink-0 overflow-y-auto border-l border-brand-border bg-white lg:block">
            {view === "companies" && primaryCompany ? (
              <CompanyDetailPanel
                company={primaryCompany}
                decisionMakerHint={primaryCompanyDecisionMaker}
                decisionMakerLeadId={primaryCompanyDecisionMakerLeadId}
                onWebsiteResolved={(resolved) =>
                  applyResolvedCompanyDomain(primaryCompany.id, resolved.domain, resolved.website)
                }
              />
            ) : view === "people" && primaryPerson ? (
              <PersonDetailPanel
                person={primaryPerson}
                index={primaryPersonIndex}
                companyName={companies.find((c) => c.id === primaryPerson.companyId)?.name}
                companyWebsite={companies.find((c) => c.id === primaryPerson.companyId)?.website}
                companyDomain={companies.find((c) => c.id === primaryPerson.companyId)?.domain}
                onWebsiteResolved={(resolved) => {
                  const cid = primaryPerson.companyId;
                  if (cid) applyResolvedCompanyDomain(cid, resolved.domain, resolved.website);
                }}
              />
            ) : (
              <div className="flex h-full items-center justify-center p-8 text-center text-[13px] text-brand-ink-faint">
                {view === "companies"
                  ? "Click a company tile to see details"
                  : "Click a lead card to see their profile"}
              </div>
            )}
          </div>
        </div>
      </div>
      {scoutModals}
    </>
  );
}
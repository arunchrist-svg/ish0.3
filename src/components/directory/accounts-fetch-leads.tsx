"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Loader2, Users } from "lucide-react";
import { toast } from "sonner";
import { PeopleList } from "@/components/scouting/people-list";
import { RolePickerModal, FetchLeadsRiskModal } from "@/components/scouting/role-picker-modal";
import {
  scoutBootstrap,
  scoutPeople,
  scoutSave,
  scoutSaveCompanies,
  type DirectoryCompany,
} from "@/lib/api-client";
import type { ScoutCompanyResult, ScoutPersonResult, DataMode } from "@/lib/enrichment/types";
import { assessPeopleFetchRisk, inferRoleFromTitle } from "@/lib/enrichment/people-role-filter";
import { peoplePerCompanyLimit } from "@/lib/enrichment/people-diversity";
import { notifyCrmRecordsChanged } from "@/lib/crm-refresh";
import { normalizeLinkedInUrl, personFieldOrEmpty, cn } from "@/lib/utils";
import type { Person } from "@/lib/scouting-data";
import type { PlatformIntent } from "@/lib/brand/platform-intent";

type DiscoveredPerson = Person & { _raw: ScoutPersonResult };

function directoryToScoutCompany(company: DirectoryCompany): ScoutCompanyResult {
  return {
    name: company.name,
    domain: company.domain,
    website: company.website,
    industry: company.industry,
    city: company.city,
    employees: company.employees,
    fitScore: company.fitScore,
    companyOverview: company.companyOverview,
    dataSource: "directory",
    externalId: company.id,
  };
}

function toPersonShape(p: ScoutPersonResult, companyId: string, idx: number): DiscoveredPerson {
  const id = p.externalId?.trim() || `p-${companyId}-${idx}-${p.name.toLowerCase().replace(/\s+/g, "-")}`;
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
    email: p.email ?? "",
    phone: p.phone ?? "",
    bio: p.bio ?? "",
    _raw: p,
  };
}

type Props = {
  company: DirectoryCompany;
  onSaved?: () => void;
};

export function AccountsFetchLeads({ company, onSaved }: Props) {
  const [showRolePicker, setShowRolePicker] = useState(false);
  const [showFetchRisk, setShowFetchRisk] = useState(false);
  const [pendingRoles, setPendingRoles] = useState<{
    seniority: string[];
    departments: string[];
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [people, setPeople] = useState<DiscoveredPerson[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);
  const [dataMode, setDataMode] = useState<DataMode>("free");
  const [scoutLeadsLimit, setScoutLeadsLimit] = useState(5);
  const [platformIntent, setPlatformIntent] = useState<PlatformIntent | null>(null);

  useEffect(() => {
    setPeople([]);
    setSelectedIds(new Set());
    setNotice(null);
    setShowRolePicker(false);
    setShowFetchRisk(false);
    setPendingRoles(null);
  }, [company.id]);

  useEffect(() => {
    void scoutBootstrap()
      .then((data) => {
        if (data.dataMode) setDataMode(data.dataMode);
        if (typeof data.scoutLeadsLimit === "number") setScoutLeadsLimit(data.scoutLeadsLimit);
      })
      .catch(() => {
        /* defaults fine */
      });
    void fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        const intent = data?.platformIntent as PlatformIntent | undefined;
        if (intent) setPlatformIntent(intent);
      })
      .catch(() => {
        /* optional */
      });
  }, []);

  const cityList = useMemo(() => {
    const city = company.city?.trim();
    return city ? [city] : [];
  }, [company.city]);

  function openFetchLeads() {
    setShowRolePicker(true);
  }

  function confirmIfRisky(seniority: string[], departments: string[]) {
    const risk = assessPeopleFetchRisk({
      companyCount: 1,
      cities: cityList,
      seniority,
      departments,
      searchKind: "industry",
      locationScope: "interest",
    });
    if (!risk.needsConfirm) {
      void runFetch(seniority, departments);
      return;
    }
    setPendingRoles({ seniority, departments });
    setShowFetchRisk(true);
  }

  async function runFetch(seniority: string[], departments: string[]) {
    setShowRolePicker(false);
    setShowFetchRisk(false);
    setPendingRoles(null);
    setLoading(true);
    setNotice(null);
    setPeople([]);
    setSelectedIds(new Set());
    const missingDomain = !company.domain?.trim() && !company.website?.trim();
    if (missingDomain) {
      setNotice(
        `No website on file for ${company.name}. Looking up a domain first, then LinkedIn. This is slower and often finds fewer people.`,
      );
    }
    try {
      const result = await scoutPeople({
        companyName: company.name,
        companyDomain: company.domain,
        companyWebsite: company.website,
        dataMode,
        limit: peoplePerCompanyLimit(scoutLeadsLimit),
        seniority,
        departments,
        cities: cityList,
        peopleCities: cityList,
        searchKind: "industry",
        locationScope: "interest",
      });

      // Persist a resolved domain so the next Fetch / Overview is faster and more accurate.
      if (result.resolvedDomain && (!company.domain || company.domain !== result.resolvedDomain)) {
        try {
          await scoutSaveCompanies({
            companies: [
              {
                ...directoryToScoutCompany(company),
                domain: result.resolvedDomain,
                website: result.resolvedWebsite ?? company.website ?? `https://www.${result.resolvedDomain}`,
              },
            ],
            dataMode,
          });
          onSaved?.();
        } catch {
          /* domain persist is best-effort */
        }
      }

      const shaped = result.people.map((p, i) => toPersonShape(p, company.id, i));
      setPeople(shaped);
      setSelectedIds(new Set(shaped.map((p) => p.id)));
      const warnings = [...(result.warnings ?? []), ...(result.errors ?? [])];
      if (!shaped.length) {
        setNotice(
          missingDomain && !result.resolvedDomain
            ? `No people found. Add a website for ${company.name} (or click Refresh on Company Overview), then Fetch Leads again.`
            : warnings[0] ??
                "No decision-makers found for these people filters. Try Skip or fewer seniority and department chips.",
        );
      } else if (warnings[0]) {
        setNotice(warnings[0]);
      }
      if (shaped.length) {
        toast.success(`Found ${shaped.length} people at ${company.name}`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not fetch leads";
      setNotice(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddLeads() {
    const selected = people.filter((p) => selectedIds.has(p.id));
    if (!selected.length || saving) return;
    setSaving(true);
    try {
      const result = await scoutSave({
        company: directoryToScoutCompany(company),
        people: selected.map((p) => p._raw),
        dataMode,
      });
      const saved = result.saved?.length ?? 0;
      const skipped = result.skipped?.length ?? 0;
      if (saved > 0) {
        toast.success(`Added ${saved} lead${saved === 1 ? "" : "s"}`);
        notifyCrmRecordsChanged({ source: "accounts_fetch_leads", savedLeads: saved });
        onSaved?.();
        setPeople([]);
        setSelectedIds(new Set());
        setNotice(null);
      } else if (skipped > 0) {
        toast.info(result.skipped?.[0]?.reason ?? "Those people were already saved");
      } else {
        toast.error("No leads were saved");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save leads");
    } finally {
      setSaving(false);
    }
  }

  function togglePerson(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <>
      <div className="border-t border-brand-border p-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-brand-ink-faint">
              Find people
            </p>
            <p className="mt-0.5 text-[12px] text-brand-ink-soft">
              Same people filters as Scouting. Uses {company.city?.trim() || "any city"}
              {!company.domain?.trim() && !company.website?.trim()
                ? ". No website saved yet, so search is slower."
                : "."}
            </p>
          </div>
          <button
            type="button"
            onClick={openFetchLeads}
            disabled={loading}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-[12px] font-bold transition-all",
              loading
                ? "bg-brand-canvas text-brand-ink-faint"
                : "bg-brand-green text-white shadow-[var(--shadow-brand)] hover:opacity-95",
            )}
          >
            {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Users className="size-3.5" />}
            {loading ? "Fetching…" : "Fetch Leads"}
          </button>
        </div>

        {notice ? (
          <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] leading-snug text-amber-950">
            {notice}
          </p>
        ) : null}

        {people.length > 0 ? (
          <div className="mt-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-[11px] font-bold uppercase tracking-wide text-brand-ink-faint">
                Discovered ({people.length})
              </p>
              <button
                type="button"
                onClick={() => void handleAddLeads()}
                disabled={saving || selectedIds.size === 0}
                className="inline-flex items-center gap-1 rounded-full bg-brand-black px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-50"
              >
                {saving ? "Saving…" : `Add ${selectedIds.size} as Leads`}
                <ArrowRight className="size-3" />
              </button>
            </div>
            <PeopleList
              people={people}
              selectedIds={selectedIds}
              primaryId={null}
              onToggleSelect={togglePerson}
              onSetPrimary={() => {}}
              selectable
            />
          </div>
        ) : null}
      </div>

      {showRolePicker ? (
        <RolePickerModal
          platformIntent={platformIntent}
          verticalScope="industries"
          onConfirm={(seniority, departments) => {
            setShowRolePicker(false);
            confirmIfRisky(seniority, departments);
          }}
          onSkip={() => {
            setShowRolePicker(false);
            void runFetch([], []);
          }}
        />
      ) : null}

      {showFetchRisk && pendingRoles ? (
        <FetchLeadsRiskModal
          companyCount={1}
          cities={cityList}
          seniority={pendingRoles.seniority}
          departments={pendingRoles.departments}
          searchKind="industries"
          locationScope="interest"
          onCancel={() => {
            setShowFetchRisk(false);
            setPendingRoles(null);
          }}
          onUseSuggestedFilters={() => {
            const risk = assessPeopleFetchRisk({
              companyCount: 1,
              cities: cityList,
              seniority: pendingRoles.seniority,
              departments: pendingRoles.departments,
              searchKind: "industry",
              locationScope: "interest",
            });
            if (!risk.suggestedFilters) return;
            void runFetch(risk.suggestedFilters.seniority, risk.suggestedFilters.departments);
          }}
          onFetchWithoutFilters={() => void runFetch([], [])}
          onFetchAnyway={() => void runFetch(pendingRoles.seniority, pendingRoles.departments)}
        />
      ) : null}
    </>
  );
}

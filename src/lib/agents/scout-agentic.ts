/**
 * Agentic Scout: pro lead-finding pipeline used when Settings → AI is Agentic AI.
 *
 * Builds on discoverCompanies / discoverPeople with ICP from preference profile
 * and stack-aware provider defaults (Directories via Tavily, or Places + Apollo).
 */
import { randomUUID } from "crypto";
import { discoverCompanies, discoverPeople } from "@/lib/enrichment/waterfall";
import { saveScoutLeads } from "@/lib/scout/save-leads";
import { logAudit } from "@/lib/audit";
import {
  applyAgenticScoutDefaults,
  getScoutCompaniesLimit,
  getScoutLeadsLimit,
  resolveAgenticDataStack,
  type EnrichmentConfig,
} from "@/lib/enrichment/config";
import { peoplePerCompanyLimit } from "@/lib/enrichment/people-diversity";
import {
  getResolvedEnrichmentConfigForWorkspace,
  getResolvedWorkspaceEnrichmentConfig,
} from "@/lib/settings/workspace-settings";
import { loadUserPreferenceProfile } from "@/lib/settings/preference-profile";
import { scoutLocationOptions, defaultLabelsFromLocationOptions } from "@/lib/geo/india";
import type { DataMode, ScoutCompanyResult } from "@/lib/enrichment/types";
import { mapWithConcurrency } from "@/lib/async";
import { db, accounts } from "@/db";
import { eq } from "drizzle-orm";
import type { ScoutBatchParams, ScoutBatchResult, ScoutStageTrace } from "@/lib/agents/scout";
import type { StageRecord } from "@/lib/enrichment/stage-trace";

const AGENT_COMPANY_CONCURRENCY = 4;
/** Soft target: keep discovering people until we approach this many saved leads. */
const LEAD_FILL_RATIO = 0.7;

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const v = raw.trim();
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

export type AgenticCompanyDiscoveryParams = {
  tenantId: string;
  workspaceId: string;
  cities: string[];
  industries?: string[];
  seniority?: string[];
  departments?: string[];
  limit: number;
  excludeNames?: string[];
  excludeSavedAccounts?: boolean;
  skipInternal?: boolean;
  fetchSeed?: number;
  employeeBands?: string[];
  locationScope?: "focus" | "interest";
  searchKind?: "industry" | "business";
  onPartial?: (companies: ScoutCompanyResult[]) => void | Promise<void>;
  qualityContext?: { userId?: string; sessionId?: string | null };
};

export type AgenticCompanyDiscoveryResult = {
  companies: ScoutCompanyResult[];
  warnings: string[];
  errors: string[];
  qualityMetrics?: {
    coverage?: unknown;
    scale?: unknown;
    stageTrace?: StageRecord[];
  };
};

/**
 * Company discovery for Scouting when Company search = Agentic AI.
 * Merges preference ICP. Does not wipe industries on a thin first pass.
 */
export async function discoverAgenticCompaniesForScout(
  params: AgenticCompanyDiscoveryParams,
): Promise<AgenticCompanyDiscoveryResult> {
  const prefs = await loadUserPreferenceProfile(params.workspaceId);
  const industries = uniqueStrings([
    ...(params.industries ?? []),
    ...(prefs.scout?.industries ?? []),
  ]);
  const seniority = uniqueStrings([
    ...(params.seniority ?? []),
    ...(prefs.scout?.seniority ?? []),
  ]);
  const departments = uniqueStrings([
    ...(params.departments ?? []),
    ...(prefs.scout?.departments ?? []),
  ]);

  const baseConfig = await getResolvedWorkspaceEnrichmentConfig({
    dataMode: "auto",
    searchProvider: "agentic_ai",
  });
  // Quality defaults from stack; never force strict filters from People chips
  // (plant LinkedIn is thin and needs empty-result broaden).
  const enrichmentConfig: EnrichmentConfig = applyAgenticScoutDefaults(baseConfig);

  const discovery = await discoverCompanies({
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    cities: params.cities,
    industries,
    dataMode: enrichmentConfig.dataMode,
    config: enrichmentConfig,
    limit: params.limit,
    excludeNames: params.excludeNames,
    excludeSavedAccounts: params.excludeSavedAccounts,
    skipInternal: params.skipInternal,
    fetchSeed: params.fetchSeed,
    employeeBands: params.employeeBands,
    seniority,
    departments,
    locationScope: params.locationScope,
    searchKind: params.searchKind,
    onPartial: params.onPartial,
    qualityContext: params.qualityContext,
  });

  const warnings = [...discovery.warnings];
  if (
    discovery.companies.length < Math.max(2, Math.ceil(params.limit / 2)) &&
    industries.length > 0 &&
    discovery.companies.length > 0
  ) {
    warnings.push(
      "Agentic Scout found fewer companies than requested. Try nearby cities or Load more; industries were kept as set.",
    );
  }

  return {
    companies: discovery.companies,
    warnings,
    errors: [...discovery.errors],
    qualityMetrics: discovery.qualityMetrics,
  };
}

export async function runAgenticScoutBatch(params: ScoutBatchParams): Promise<ScoutBatchResult> {
  const runId = randomUUID();
  const workspaceCfg = await getResolvedEnrichmentConfigForWorkspace(params.workspaceId);
  const prefs = await loadUserPreferenceProfile(params.workspaceId);

  const locationOptions = scoutLocationOptions(
    workspaceCfg.scoutGeo,
    workspaceCfg.scoutAreasOfFocus ?? workspaceCfg.scoutAreaOfFocus,
  );
  const locationLabels = defaultLabelsFromLocationOptions(locationOptions);
  const cities = params.cities?.length ? params.cities : locationLabels;

  const industries = uniqueStrings([
    ...(params.industries ?? []),
    ...(prefs.scout?.industries ?? []),
  ]);
  const seniority = uniqueStrings([
    ...(params.seniority ?? []),
    ...(prefs.scout?.seniority ?? []),
  ]);
  const departments = uniqueStrings([
    ...(params.departments ?? []),
    ...(prefs.scout?.departments ?? []),
  ]);

  // Agentic locks quality defaults; request dataMode is ignored so users cannot
  // accidentally route Indian locality scouts through Apollo-only company search.
  const baseConfig = await getResolvedWorkspaceEnrichmentConfig({
    dataMode: "auto",
    searchProvider: "agentic_ai",
  });
  const enrichmentConfig: EnrichmentConfig = applyAgenticScoutDefaults(baseConfig);
  const dataMode: DataMode = enrichmentConfig.dataMode;
  const stack = resolveAgenticDataStack(baseConfig.agenticDataStack);

  const companyLimit = params.companyLimit ?? workspaceCfg.scoutCompaniesLimit ?? getScoutCompaniesLimit();
  const leadsLimit = workspaceCfg.scoutLeadsLimit ?? getScoutLeadsLimit();
  const maxCompanies = params.maxCompaniesToProcess ?? Math.max(companyLimit * 2, 20);
  const leadTarget = Math.max(1, Math.ceil(companyLimit * leadsLimit * LEAD_FILL_RATIO));

  const errors: string[] = [];
  const stageTrace: ScoutStageTrace[] = [];
  let leadsSaved = 0;
  let leadsSkipped = 0;

  if (!cities.length) {
    const emptyMessage = locationOptions.some((option) => option.kind === "area")
      ? "Select at least one nearby area"
      : "Select at least one city";
    await logAudit({
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      action: "scout.agentic.started",
      entityType: "scout_run",
      metadata: {
        runId,
        cities,
        industries,
        seniority,
        departments,
        dataMode,
        companyLimit,
        maxCompanies,
        mode: "agentic",
      },
    });
    return {
      runId,
      companiesDiscovered: 0,
      leadsSaved: 0,
      leadsSkipped: 0,
      errors: [emptyMessage],
      stageTrace,
    };
  }

  await logAudit({
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    action: "scout.agentic.started",
    entityType: "scout_run",
    metadata: {
      runId,
      cities,
      industries,
      seniority,
      departments,
      dataMode,
      companyLimit,
      maxCompanies,
      mode: "agentic",
      icpFromPrefs: Boolean(prefs.scout?.industries?.length || prefs.scout?.seniority?.length),
    },
  });

  stageTrace.push({
    stage: "company_discovery",
    status: "started",
    provider: "agentic_ai",
    reason:
      stack === "places_apollo"
        ? "Agentic Scout: Google Places + Apollo (no Tavily), ICP from workspace preferences."
        : "Agentic Scout: India directories + AI with ICP from workspace preferences.",
  });

  const discovery = await discoverAgenticCompaniesForScout({
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    cities,
    industries,
    seniority,
    departments,
    limit: companyLimit,
    skipInternal: true,
  });

  errors.push(...discovery.errors, ...discovery.warnings);
  const companies = discovery.companies;

  stageTrace.push({
    stage: "company_discovery",
    status: "completed",
    provider: enrichmentConfig.searchProvider,
    count: companies.length,
  });

  const scaleCounts = companies.reduce(
    (counts, company) => {
      counts[company.scaleStatus ?? "unknown"] += 1;
      return counts;
    },
    { verified: 0, estimated: 0, unknown: 0 },
  );
  stageTrace.push({
    stage: "scale_verification",
    status: "completed",
    provider: scaleCounts.verified ? "apollo" : "none",
    count: scaleCounts.verified,
    reason: scaleCounts.verified
      ? `${scaleCounts.verified} companies have verified employee evidence.`
      : "No configured scale verifier returned employee evidence.",
  });

  const toProcess = companies.slice(0, maxCompanies);

  let tenantAccounts: (typeof accounts.$inferSelect)[] = [];
  try {
    tenantAccounts = await db
      .select()
      .from(accounts)
      .where(eq(accounts.tenantId, params.tenantId));
  } catch (e) {
    console.warn("[scout-agentic] tenant accounts preload failed:", e);
  }

  if (enrichmentConfig.peopleSearchProvider === "none") {
    stageTrace.push({
      stage: "people_discovery",
      status: "skipped",
      provider: "none",
      count: 0,
      reason: "People search is turned off.",
    });
  } else {
    stageTrace.push({
      stage: "people_discovery",
      status: "started",
      provider: enrichmentConfig.peopleSearchProvider,
      count: toProcess.length,
      reason: "Agentic Scout finds decision-makers per company, then quality-gates on save.",
    });
  }

  if (enrichmentConfig.peopleSearchProvider !== "none") {
    await mapWithConcurrency(toProcess, AGENT_COMPANY_CONCURRENCY, async (company) => {
      if (leadsSaved >= leadTarget) return;

      try {
        const { people, resolvedDomain, resolvedWebsite } = await discoverPeople({
          tenantId: params.tenantId,
          workspaceId: params.workspaceId,
          companyName: company.name,
          companyDomain: company.domain,
          companyWebsite: company.website,
          dataMode,
          config: enrichmentConfig,
          limit: peoplePerCompanyLimit(leadsLimit),
          seniority: seniority.length ? seniority : undefined,
          departments: departments.length ? departments : undefined,
          cities,
          tenantAccounts,
        });

        const candidates = people.filter((p) => p.name?.trim());
        if (!candidates.length) {
          leadsSkipped += 1;
          return;
        }

        const result = await saveScoutLeads({
          people: candidates.slice(0, peoplePerCompanyLimit(leadsLimit)),
          company: {
            ...company,
            domain: resolvedDomain ?? company.domain,
            website: resolvedWebsite ?? company.website,
          },
          dataMode,
          leadSource: "scout_agentic",
          tenantId: params.tenantId,
          workspaceId: params.workspaceId,
          createdByUserId: params.userId,
          enrichmentConfig: { ...enrichmentConfig, enrichOnImport: true },
        });

        leadsSaved += result.saved.length;
        leadsSkipped += result.skipped.length;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`${company.name}: ${msg}`);
      }
    });

    stageTrace.push({
      stage: "people_discovery",
      status: "completed",
      provider: enrichmentConfig.peopleSearchProvider,
      count: Math.max(0, toProcess.length - leadsSkipped),
    });
  }

  stageTrace.push({
    stage: "lead_save",
    status: enrichmentConfig.peopleSearchProvider === "none" ? "skipped" : "completed",
    count: leadsSaved,
    reason:
      enrichmentConfig.peopleSearchProvider === "none"
        ? "No people provider was enabled."
        : "Agentic Scout saved eligible decision-makers after quality gates.",
  });

  await logAudit({
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    action: "scout.agentic.completed",
    entityType: "scout_run",
    metadata: {
      runId,
      companiesDiscovered: companies.length,
      leadsSaved,
      leadsSkipped,
      errors: errors.length,
      stageTrace,
      mode: "agentic",
    },
  });

  return {
    runId,
    companiesDiscovered: companies.length,
    leadsSaved,
    leadsSkipped,
    errors,
    stageTrace,
  };
}

import { randomUUID } from "crypto";
import { discoverCompanies, discoverPeople } from "@/lib/enrichment/waterfall";
import { saveScoutLeads } from "@/lib/scout/save-leads";
import { logAudit } from "@/lib/audit";
import { getScoutCompaniesLimit, getScoutLeadsLimit } from "@/lib/enrichment/config";
import { peoplePerCompanyLimit } from "@/lib/enrichment/people-diversity";
import {
  getResolvedEnrichmentConfigForWorkspace,
  getResolvedWorkspaceEnrichmentConfig,
} from "@/lib/settings/workspace-settings";
import { scoutLocationOptions, defaultLabelsFromLocationOptions } from "@/lib/geo/india";
import type { DataMode } from "@/lib/enrichment/types";
import { mapWithConcurrency } from "@/lib/async";
import { db, accounts } from "@/db";
import { eq } from "drizzle-orm";

export type ScoutBatchParams = {
  tenantId: string;
  workspaceId: string;
  userId?: string;
  cities?: string[];
  industries?: string[];
  dataMode?: DataMode;
  companyLimit?: number;
  maxCompaniesToProcess?: number;
  seniority?: string[];
  departments?: string[];
};

export type ScoutBatchResult = {
  runId: string;
  companiesDiscovered: number;
  leadsSaved: number;
  leadsSkipped: number;
  errors: string[];
  stageTrace: ScoutStageTrace[];
};

export type ScoutStageTrace = {
  stage: "company_discovery" | "scale_verification" | "people_discovery" | "lead_save";
  status: "started" | "completed" | "skipped";
  provider?: string;
  count?: number;
  reason?: string;
};

const AGENT_COMPANY_CONCURRENCY = 4;

export async function runScoutBatch(params: ScoutBatchParams): Promise<ScoutBatchResult> {
  const runId = randomUUID();
  const workspaceCfg = await getResolvedEnrichmentConfigForWorkspace(params.workspaceId);
  const locationOptions = scoutLocationOptions(
    workspaceCfg.scoutGeo,
    workspaceCfg.scoutAreasOfFocus ?? workspaceCfg.scoutAreaOfFocus,
  );
  const locationLabels = defaultLabelsFromLocationOptions(locationOptions);
  const cities = params.cities?.length ? params.cities : locationLabels;
  const dataMode = params.dataMode ?? (process.env.DEFAULT_DATA_MODE as DataMode) ?? "free";
  const enrichmentConfig = await getResolvedWorkspaceEnrichmentConfig({ dataMode });
  const companyLimit = params.companyLimit ?? getScoutCompaniesLimit();
  const maxCompanies = params.maxCompaniesToProcess ?? 20;

  const industries = params.industries ?? [];
  const seniority = params.seniority ?? [];
  const departments = params.departments ?? [];
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
      action: "scout.batch.started",
      entityType: "scout_run",
      metadata: { runId, cities, industries, seniority, departments, dataMode, companyLimit, maxCompanies },
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
    action: "scout.batch.started",
    entityType: "scout_run",
    metadata: { runId, cities, industries, seniority, departments, dataMode, companyLimit, maxCompanies },
  });

  const discovery = await discoverCompanies({
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    cities,
    industries,
    dataMode,
    config: enrichmentConfig,
    limit: companyLimit,
    skipInternal: true,
    seniority,
    departments,
  });

  stageTrace.push({
    stage: "company_discovery",
    status: "completed",
    provider: enrichmentConfig.searchProvider,
    count: discovery.companies.length,
  });
  const scaleCounts = discovery.companies.reduce(
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

  errors.push(...discovery.errors, ...discovery.warnings);
  const toProcess = discovery.companies.slice(0, maxCompanies);

  let tenantAccounts: (typeof accounts.$inferSelect)[] = [];
  try {
    tenantAccounts = await db
      .select()
      .from(accounts)
      .where(eq(accounts.tenantId, params.tenantId));
  } catch (e) {
    console.warn("[scout] tenant accounts preload failed:", e);
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
    });
  }

  if (enrichmentConfig.peopleSearchProvider !== "none") {
    await mapWithConcurrency(toProcess, AGENT_COMPANY_CONCURRENCY, async (company) => {
    try {
      const { people, resolvedDomain, resolvedWebsite } = await discoverPeople({
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        companyName: company.name,
        companyDomain: company.domain,
        companyWebsite: company.website,
        dataMode,
        config: enrichmentConfig,
        limit: peoplePerCompanyLimit(getScoutLeadsLimit()),
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
        people: candidates.slice(0, peoplePerCompanyLimit(getScoutLeadsLimit())),
        company: {
          ...company,
          domain: resolvedDomain ?? company.domain,
          website: resolvedWebsite ?? company.website,
        },
        dataMode,
        leadSource: "scout_agent",
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
      count: toProcess.length - leadsSkipped,
    });
  }

  stageTrace.push({
    stage: "lead_save",
    status: enrichmentConfig.peopleSearchProvider === "none" ? "skipped" : "completed",
    count: leadsSaved,
    reason:
      enrichmentConfig.peopleSearchProvider === "none"
        ? "No people provider was enabled."
        : "Saved eligible people returned by the people stage.",
  });

  await logAudit({
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    action: "scout.batch.completed",
    entityType: "scout_run",
    metadata: {
      runId,
      companiesDiscovered: discovery.companies.length,
      leadsSaved,
      leadsSkipped,
      errors: errors.length,
      stageTrace,
    },
  });

  return {
    runId,
    companiesDiscovered: discovery.companies.length,
    leadsSaved,
    leadsSkipped,
    errors,
    stageTrace,
  };
}

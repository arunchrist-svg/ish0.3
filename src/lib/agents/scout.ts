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
import { getResolvedEmailConfig } from "@/lib/settings/email-settings";
import { locationOptionsFromSelection } from "@/lib/geo/india";
import type { DataMode } from "@/lib/enrichment/types";
import { mapWithConcurrency } from "@/lib/async";
import { db, accounts } from "@/db";
import { eq } from "drizzle-orm";

export type ScoutBatchParams = {
  tenantId: string;
  workspaceId: string;
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
  appliedBrandDefaults?: {
    industries: string[];
    departments: string[];
    seniority: string[];
  };
};

const AGENT_COMPANY_CONCURRENCY = 4;

export async function runScoutBatch(params: ScoutBatchParams): Promise<ScoutBatchResult> {
  const runId = randomUUID();
  const workspaceCfg = await getResolvedEnrichmentConfigForWorkspace(params.workspaceId);
  const locationLabels = locationOptionsFromSelection(workspaceCfg.scoutGeo).map((o) => o.label);
  const cities = params.cities?.length ? params.cities : locationLabels;
  const dataMode = params.dataMode ?? (process.env.DEFAULT_DATA_MODE as DataMode) ?? "free";
  const companyLimit = params.companyLimit ?? getScoutCompaniesLimit();
  const maxCompanies = params.maxCompaniesToProcess ?? 20;

  // Prefer caller filters; otherwise use website-derived scout targets from brand setup
  let industries = params.industries ?? [];
  let seniority = params.seniority ?? [];
  let departments = params.departments ?? [];
  let appliedBrandDefaults: ScoutBatchResult["appliedBrandDefaults"];

  if (!industries.length || !seniority.length || !departments.length) {
    try {
      const emailConfig = await getResolvedEmailConfig(params.workspaceId);
      const insights = emailConfig.brandConfig?.websiteInsights;
      if (insights) {
        if (!industries.length && insights.scoutIndustries.length) {
          industries = [...insights.scoutIndustries];
        }
        if (!departments.length && insights.scoutDepartments.length) {
          departments = [...insights.scoutDepartments];
        }
        if (!seniority.length && insights.scoutSeniority.length) {
          seniority = [...insights.scoutSeniority];
        }
        appliedBrandDefaults = {
          industries: insights.scoutIndustries,
          departments: insights.scoutDepartments,
          seniority: insights.scoutSeniority,
        };
      }
    } catch (e) {
      console.warn("[scout] brand defaults load failed:", e);
    }
  }

  const errors: string[] = [];
  let leadsSaved = 0;
  let leadsSkipped = 0;

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
    limit: companyLimit,
    skipInternal: true,
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

  const enrichmentConfig = await getResolvedWorkspaceEnrichmentConfig({ dataMode });

  await mapWithConcurrency(toProcess, AGENT_COMPANY_CONCURRENCY, async (company) => {
    try {
      const { people, resolvedDomain, resolvedWebsite } = await discoverPeople({
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        companyName: company.name,
        companyDomain: company.domain,
        companyWebsite: company.website,
        dataMode,
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
        enrichmentConfig: { ...enrichmentConfig, enrichOnImport: true },
      });

      leadsSaved += result.saved.length;
      leadsSkipped += result.skipped.length;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${company.name}: ${msg}`);
    }
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
    },
  });

  return {
    runId,
    companiesDiscovered: discovery.companies.length,
    leadsSaved,
    leadsSkipped,
    errors,
    appliedBrandDefaults,
  };
}

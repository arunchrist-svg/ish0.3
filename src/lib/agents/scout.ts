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
  const companyLimit = params.companyLimit ?? getScoutCompaniesLimit();
  const maxCompanies = params.maxCompaniesToProcess ?? 20;

  const industries = params.industries ?? [];
  const seniority = params.seniority ?? [];
  const departments = params.departments ?? [];
  const errors: string[] = [];
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
    limit: companyLimit,
    skipInternal: true,
    seniority,
    departments,
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
  };
}

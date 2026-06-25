import { randomUUID } from "crypto";
import { discoverCompanies, discoverPeople } from "@/lib/enrichment/waterfall";
import { saveScoutLeads } from "@/lib/scout/save-leads";
import { logAudit } from "@/lib/audit";
import { getScoutCompaniesLimit, getScoutLeadsLimit } from "@/lib/enrichment/config";
import { SCOUT_CITIES } from "@/lib/scouting-data";
import type { DataMode } from "@/lib/enrichment/types";

export type ScoutBatchParams = {
  tenantId: string;
  workspaceId: string;
  cities?: string[];
  industries?: string[];
  dataMode?: DataMode;
  companyLimit?: number;
  maxCompaniesToProcess?: number;
};

export type ScoutBatchResult = {
  runId: string;
  companiesDiscovered: number;
  leadsSaved: number;
  leadsSkipped: number;
  errors: string[];
};

export async function runScoutBatch(params: ScoutBatchParams): Promise<ScoutBatchResult> {
  const runId = randomUUID();
  const cities = params.cities?.length ? params.cities : [...SCOUT_CITIES];
  const industries = params.industries ?? [];
  const dataMode = params.dataMode ?? (process.env.DEFAULT_DATA_MODE as DataMode) ?? "free";
  const companyLimit = params.companyLimit ?? getScoutCompaniesLimit();
  const maxCompanies = params.maxCompaniesToProcess ?? 20;

  const errors: string[] = [];
  let leadsSaved = 0;
  let leadsSkipped = 0;

  await logAudit({
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    action: "scout.batch.started",
    entityType: "scout_run",
    metadata: { runId, cities, industries, dataMode, companyLimit, maxCompanies },
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

  for (const company of toProcess) {
    try {
      const { people } = await discoverPeople({
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        companyName: company.name,
        companyDomain: company.domain,
        companyWebsite: company.website,
        dataMode,
        limit: getScoutLeadsLimit(),
      });

      const withEmail = people.filter((p) => p.email && p.emailStatus !== "missing");
      if (!withEmail.length) {
        leadsSkipped += 1;
        continue;
      }

      const result = await saveScoutLeads({
        people: withEmail.slice(0, 2),
        company,
        dataMode,
        leadSource: "scout_agent",
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
      });

      leadsSaved += result.saved.length;
      leadsSkipped += result.skipped.length;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${company.name}: ${msg}`);
    }
  }

  await logAudit({
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    action: "scout.batch.completed",
    entityType: "scout_run",
    metadata: { runId, companiesDiscovered: discovery.companies.length, leadsSaved, leadsSkipped, errors: errors.length },
  });

  return {
    runId,
    companiesDiscovered: discovery.companies.length,
    leadsSaved,
    leadsSkipped,
    errors,
  };
}

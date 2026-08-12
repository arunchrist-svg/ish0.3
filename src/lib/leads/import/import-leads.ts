import { db, contacts, accounts, leads } from "@/db";
import { eq } from "drizzle-orm";
import { createManualLead } from "@/lib/leads/crud";
import { enrichLeadById } from "@/lib/enrichment/enrich-lead";
import { enrichModeForSettings } from "@/lib/enrichment/provider-config";
import { getResolvedWorkspaceEnrichmentConfig } from "@/lib/settings/workspace-settings";
import { enqueueResearchForLeads } from "@/lib/jobs/enqueue";
import { applyColumnMapping, mappingHasRequiredFields } from "./apply-mapping";
import type {
  ColumnMapping,
  ImportLeadsSummary,
  ImportRowResult,
  NormalizedImportRow,
} from "./types";

const ENRICH_CONCURRENCY = 3;

function needsEnrichment(row: {
  email: string | null;
  emailStatus: string | null;
  phone: string | null;
  title: string | null;
  linkedIn: string | null;
  domain: string | null;
  website: string | null;
}): boolean {
  const emailOk =
    !!row.email &&
    row.emailStatus !== "missing" &&
    row.emailStatus !== "generic";
  const phoneOk = !!row.phone?.trim();
  const titleOk = !!row.title?.trim();
  const linkedInOk = !!row.linkedIn?.trim();
  const domainOk = !!(row.domain?.trim() || row.website?.trim());
  return !(emailOk && phoneOk && titleOk && linkedInOk && domainOk);
}

async function mapPool<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

async function createOne(
  row: NormalizedImportRow,
  ctx: { tenantId: string; workspaceId: string; actorId?: string },
): Promise<ImportRowResult> {
  try {
    const result = await createManualLead({
      tenantId: ctx.tenantId,
      workspaceId: ctx.workspaceId,
      actorId: ctx.actorId,
      name: row.name,
      company: row.company,
      title: row.title,
      email: row.email,
      phone: row.phone,
      linkedIn: row.linkedIn,
      city: row.city,
      industry: row.industry,
      employees: row.employees,
      score: row.score,
      tags: row.tags,
      rating: row.rating,
      owner: row.owner,
      leadSource: "csv_import",
      dataSource: "csv_import",
    });

    if (result.existing) {
      return {
        rowIndex: row.rowIndex,
        name: row.name,
        company: row.company,
        status: "skipped",
        leadId: result.id,
        error: "Duplicate lead (same name + company)",
      };
    }

    return {
      rowIndex: row.rowIndex,
      name: row.name,
      company: row.company,
      status: "created",
      leadId: result.id,
    };
  } catch (error) {
    return {
      rowIndex: row.rowIndex,
      name: row.name,
      company: row.company,
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function importMappedLeads(params: {
  tenantId: string;
  workspaceId: string;
  actorId?: string;
  rawRows: Record<string, string>[];
  mapping: ColumnMapping;
  enrich?: boolean;
}): Promise<ImportLeadsSummary> {
  const required = mappingHasRequiredFields(params.mapping);
  if (!required.ok) {
    throw new Error(`Missing required column mappings: ${required.missing.join(", ")}`);
  }

  const { rows, invalid } = applyColumnMapping(params.rawRows, params.mapping);
  const results: ImportRowResult[] = invalid.map((inv) => ({
    rowIndex: inv.rowIndex,
    name: "",
    company: "",
    status: "failed" as const,
    error: inv.reason,
  }));
  const errors: string[] = invalid.map((inv) => `Row ${inv.rowIndex}: ${inv.reason}`);

  const createdResults: ImportRowResult[] = [];
  for (const row of rows) {
    const result = await createOne(row, {
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      actorId: params.actorId,
    });
    results.push(result);
    if (result.status === "failed" && result.error) {
      errors.push(`Row ${result.rowIndex}: ${result.error}`);
    }
    if (result.status === "created" && result.leadId) {
      createdResults.push(result);
    }
  }

  let enrichedCount = 0;
  const shouldEnrich = params.enrich !== false;

  if (shouldEnrich && createdResults.length) {
    const cfg = await getResolvedWorkspaceEnrichmentConfig();
    if (cfg.enrichOnImport && cfg.enrichProvider !== "none") {
      const mode = enrichModeForSettings(cfg.enrichProvider, cfg.dataMode);
      const enrichOutcomes = await mapPool(createdResults, ENRICH_CONCURRENCY, async (item) => {
        if (!item.leadId) return { leadId: "", enriched: false };

        const rows = await db
          .select({
            email: contacts.email,
            emailStatus: contacts.emailStatus,
            phone: contacts.phone,
            title: contacts.title,
            linkedIn: contacts.linkedIn,
            domain: accounts.domain,
            website: accounts.website,
          })
          .from(leads)
          .innerJoin(contacts, eq(contacts.id, leads.contactId))
          .innerJoin(accounts, eq(accounts.id, leads.accountId))
          .where(eq(leads.id, item.leadId))
          .limit(1);

        const contactRow = rows[0];
        if (!contactRow || !needsEnrichment(contactRow)) {
          return { leadId: item.leadId, enriched: false };
        }

        try {
          await enrichLeadById({
            leadId: item.leadId,
            mode,
            dataMode: cfg.dataMode,
          });
          return { leadId: item.leadId, enriched: true };
        } catch (error) {
          errors.push(
            `Row ${item.rowIndex} enrich failed: ${error instanceof Error ? error.message : String(error)}`,
          );
          return { leadId: item.leadId, enriched: false };
        }
      });

      for (const outcome of enrichOutcomes) {
        if (!outcome.enriched) continue;
        enrichedCount++;
        const match = results.find((r) => r.leadId === outcome.leadId && r.status === "created");
        if (match) match.enriched = true;
      }
    }

    void enqueueResearchForLeads(createdResults.map((r) => r.leadId!).filter(Boolean));
  }

  return {
    created: results.filter((r) => r.status === "created").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    failed: results.filter((r) => r.status === "failed").length,
    enriched: enrichedCount,
    results,
    errors,
  };
}

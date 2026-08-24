import { db, contacts, accounts, leads, yieldFunnel } from "@/db";
import { and, eq } from "drizzle-orm";
import { enrichLeadById } from "@/lib/enrichment/enrich-lead";
import { enrichModeForSettings } from "@/lib/enrichment/provider-config";
import { getResolvedWorkspaceEnrichmentConfig } from "@/lib/settings/workspace-settings";
import { enqueueResearchForLeads } from "@/lib/jobs/enqueue";
import { sanitizeEmail, isGenericCompanyEmail, sanitizePhone } from "@/lib/enrichment/validate-contact";
import { toDbEmailStatus } from "@/lib/enrichment/contact-emails";
import { normalizeLinkedInUrl } from "@/lib/utils";
import { logAudit } from "@/lib/audit";
import { applyColumnMapping, mappingHasRequiredFields } from "./apply-mapping";
import { planBulkImport } from "./bulk-plan";
import {
  INLINE_ENRICH_MAX,
  RESEARCH_ENQUEUE_MAX,
  type ColumnMapping,
  type ImportLeadsSummary,
  type ImportRowResult,
} from "./types";

const DEFAULT_CAMPAIGN = "00000000-0000-0000-0000-000000000003";
const INSERT_CHUNK = 250;
const ENRICH_CONCURRENCY = 3;

export function needsEnrichment(row: {
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
  const phoneOk = Boolean(sanitizePhone(row.phone));
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

async function insertChunks<T>(items: T[], insert: (chunk: T[]) => Promise<unknown>): Promise<void> {
  for (let i = 0; i < items.length; i += INSERT_CHUNK) {
    const chunk = items.slice(i, i + INSERT_CHUNK);
    if (chunk.length) await insert(chunk);
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

  const { rows, invalid, skipped: missingEmail } = applyColumnMapping(params.rawRows, params.mapping);
  const results: ImportRowResult[] = [
    ...invalid.map((inv) => ({
      rowIndex: inv.rowIndex,
      name: "",
      company: "",
      status: "failed" as const,
      error: inv.reason,
    })),
    ...missingEmail.map((skip) => ({
      rowIndex: skip.rowIndex,
      name: "",
      company: "",
      status: "skipped" as const,
      error: skip.reason,
    })),
  ];
  const errors: string[] = invalid.map((inv) => `Row ${inv.rowIndex}: ${inv.reason}`);
  const warnings: string[] = [];
  if (missingEmail.length) {
    warnings.push(
      `Skipped ${missingEmail.length} row${missingEmail.length === 1 ? "" : "s"} with no email. Loading ${rows.length}.`,
    );
  }

  const [existingAccounts, existingLeadRows] = await Promise.all([
    db
      .select({ id: accounts.id, name: accounts.name })
      .from(accounts)
      .where(and(eq(accounts.tenantId, params.tenantId), eq(accounts.workspaceId, params.workspaceId))),
    db
      .select({
        id: leads.id,
        contactId: contacts.id,
        name: contacts.name,
        company: accounts.name,
        email: contacts.email,
        enrichmentProvider: contacts.enrichmentProvider,
        enrichmentSource: contacts.enrichmentSource,
      })
      .from(leads)
      .innerJoin(contacts, eq(contacts.id, leads.contactId))
      .innerJoin(accounts, eq(accounts.id, leads.accountId))
      .where(and(eq(leads.tenantId, params.tenantId), eq(leads.workspaceId, params.workspaceId))),
  ]);

  const plan = planBulkImport({
    rows,
    existingAccounts,
    existingLeads: existingLeadRows,
  });

  for (const skipped of plan.skipped) {
    results.push(skipped);
  }

  if (plan.toInsert.length || plan.toUpdateEmail.length) {
    await db.transaction(async (tx) => {
      await insertChunks(plan.newAccounts, (chunk) =>
        tx.insert(accounts).values(
          chunk.map((account) => ({
            id: account.id,
            tenantId: params.tenantId,
            workspaceId: params.workspaceId,
            name: account.name,
            city: account.city,
            industry: account.industry,
            employees: account.employees,
            dataSource: "csv_import",
          })),
        ),
      );

      await insertChunks(plan.toInsert, (chunk) =>
        tx.insert(contacts).values(
          chunk.map(({ row, accountId, contactId }) => {
            const parts = row.name.split(/\s+/);
            const email = sanitizeEmail(row.email);
            const emailStatus = !email
              ? "missing"
              : isGenericCompanyEmail(email)
                ? "generic"
                : "unverified";
            return {
              id: contactId,
              tenantId: params.tenantId,
              workspaceId: params.workspaceId,
              accountId,
              name: row.name,
              firstName: parts[0] || null,
              lastName: parts.slice(1).join(" ") || null,
              title: row.title?.trim() || null,
              email: email ?? null,
              emailStatus: toDbEmailStatus(emailStatus),
              phone: row.phone?.trim() || null,
              linkedIn: normalizeLinkedInUrl(row.linkedIn) ?? null,
              dataSource: "csv_import",
              enrichmentProvider: email ? "manual" : null,
              enrichmentSource: email ? "manual" : null,
            };
          }),
        ),
      );

      await insertChunks(plan.toInsert, (chunk) =>
        tx.insert(leads).values(
          chunk.map(({ row, accountId, contactId, leadId }) => ({
            id: leadId,
            tenantId: params.tenantId,
            workspaceId: params.workspaceId,
            contactId,
            accountId,
            campaignId: DEFAULT_CAMPAIGN,
            status: "scouted" as const,
            score: row.score ?? 60,
            leadSource: "csv_import",
            rating: row.rating?.trim() || null,
            owner: row.owner?.trim() || null,
            researcherEligible: true,
            tags: Array.from(new Set(["Lead", "Excel Import", ...(row.tags ?? [])])),
            createdByUserId: params.actorId ?? null,
          })),
        ),
      );

      const funnelRows = plan.toInsert.flatMap(({ leadId }) => [
        { leadId, stage: "scouted" as const },
        {
          leadId,
          stage: "prefiltered" as const,
          metadata: { reason: "csv import" },
        },
      ]);
      await insertChunks(funnelRows, (chunk) => tx.insert(yieldFunnel).values(chunk));

      for (const item of plan.toUpdateEmail) {
        const emailStatus = isGenericCompanyEmail(item.email) ? "generic" : "unverified";
        await tx
          .update(contacts)
          .set({
            email: item.email,
            emailStatus: toDbEmailStatus(emailStatus),
            enrichmentProvider: "manual",
            enrichmentSource: "manual",
            updatedAt: new Date(),
          })
          .where(eq(contacts.id, item.contactId));
      }
    });
  }

  const createdResults: ImportRowResult[] = plan.toInsert.map(({ row, leadId }) => ({
    rowIndex: row.rowIndex,
    name: row.name,
    company: row.company,
    status: "created",
    leadId,
  }));
  results.push(...createdResults);

  if (plan.toUpdateEmail.length) {
    warnings.push(
      `Updated email on ${plan.toUpdateEmail.length} existing lead${plan.toUpdateEmail.length === 1 ? "" : "s"} from the spreadsheet.`,
    );
  }

  if (createdResults.length || plan.toUpdateEmail.length) {
    void logAudit({
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      actorId: params.actorId,
      action: "lead.imported",
      entityType: "lead",
      metadata: {
        created: createdResults.length,
        skipped: plan.skipped.length + missingEmail.length,
        updatedEmail: plan.toUpdateEmail.length,
        failed: invalid.length,
      },
    });
  }

  let enrichedCount = 0;
  const shouldEnrich = params.enrich !== false;

  if (shouldEnrich && createdResults.length) {
    const cfg = await getResolvedWorkspaceEnrichmentConfig();
    const canEnrich = cfg.enrichOnImport && cfg.enrichProvider !== "none";

    if (!canEnrich) {
      warnings.push("Enrichment is off in Settings, so missing fields were left as uploaded.");
    } else if (createdResults.length > INLINE_ENRICH_MAX) {
      warnings.push(
        `Loaded ${createdResults.length} leads without auto-enrichment. Open a lead and use Enrich for missing contacts.`,
      );
    } else {
      const mode = enrichModeForSettings(cfg.enrichProvider, cfg.dataMode);
      const enrichOutcomes = await mapPool(createdResults, ENRICH_CONCURRENCY, async (item) => {
        if (!item.leadId) return { leadId: "", enriched: false };

        const leadRows = await db
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

        const contactRow = leadRows[0];
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

    if (createdResults.length <= RESEARCH_ENQUEUE_MAX) {
      void enqueueResearchForLeads(createdResults.map((r) => r.leadId!).filter(Boolean));
    }
  }

  return {
    created: createdResults.length,
    skipped: results.filter((r) => r.status === "skipped").length,
    failed: results.filter((r) => r.status === "failed").length,
    enriched: enrichedCount,
    results: results.filter((r) => r.status !== "created").concat(createdResults.slice(0, 50)),
    errors,
    warnings,
  };
}

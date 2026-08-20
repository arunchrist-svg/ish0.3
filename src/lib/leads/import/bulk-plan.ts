import { randomUUID } from "node:crypto";
import { nameCompanyDedupeKey } from "@/lib/leads/duplicates";
import { sanitizeEmail } from "@/lib/enrichment/validate-contact";
import type { ImportRowResult, NormalizedImportRow } from "./types";

export type ExistingAccount = { id: string; name: string };
export type ExistingLead = {
  id: string;
  contactId: string;
  name: string;
  company: string;
  email?: string | null;
  enrichmentProvider?: string | null;
  enrichmentSource?: string | null;
};

export type PlannedAccount = {
  id: string;
  name: string;
  city?: string;
  industry?: string;
  employees?: string;
};

export type PlannedLead = {
  row: NormalizedImportRow;
  accountId: string;
  contactId: string;
  leadId: string;
};

export type PlannedEmailUpdate = {
  contactId: string;
  leadId: string;
  email: string;
  row: NormalizedImportRow;
};

export type BulkImportPlan = {
  newAccounts: PlannedAccount[];
  toInsert: PlannedLead[];
  toUpdateEmail: PlannedEmailUpdate[];
  skipped: ImportRowResult[];
};

export function planBulkImport(params: {
  rows: NormalizedImportRow[];
  existingAccounts: ExistingAccount[];
  existingLeads: ExistingLead[];
}): BulkImportPlan {
  const accountByName = new Map<string, string>();
  for (const account of params.existingAccounts) {
    const key = account.name.trim();
    if (key && !accountByName.has(key)) accountByName.set(key, account.id);
  }

  const existingByKey = new Map<string, ExistingLead>();
  for (const lead of params.existingLeads) {
    const key = nameCompanyDedupeKey(lead.name, lead.company);
    if (key && !existingByKey.has(key)) existingByKey.set(key, lead);
  }

  const newAccounts: PlannedAccount[] = [];
  const toInsert: PlannedLead[] = [];
  const toUpdateEmail: PlannedEmailUpdate[] = [];
  const skipped: ImportRowResult[] = [];
  const seenKeys = new Set(existingByKey.keys());

  for (const row of params.rows) {
    const company = row.company.trim();
    const name = row.name.trim();
    const incomingEmail = sanitizeEmail(row.email);
    const dedupeKey = nameCompanyDedupeKey(name, company);

    if (dedupeKey && seenKeys.has(dedupeKey)) {
      const existing = existingByKey.get(dedupeKey);
      const existingEmail = sanitizeEmail(existing?.email);
      if (existing && incomingEmail && existingEmail !== incomingEmail) {
        toUpdateEmail.push({
          contactId: existing.contactId,
          leadId: existing.id,
          email: incomingEmail,
          row,
        });
        existing.email = incomingEmail;
        existing.enrichmentProvider = "manual";
        existing.enrichmentSource = "manual";
        continue;
      }
      skipped.push({
        rowIndex: row.rowIndex,
        name,
        company,
        status: "skipped",
        leadId: existing?.id,
        error: "Duplicate lead (same name + company)",
      });
      continue;
    }

    let accountId = accountByName.get(company);
    if (!accountId) {
      accountId = randomUUID();
      accountByName.set(company, accountId);
      newAccounts.push({
        id: accountId,
        name: company,
        city: row.city,
        industry: row.industry,
        employees: row.employees,
      });
    }

    const contactId = randomUUID();
    const leadId = randomUUID();
    toInsert.push({ row, accountId, contactId, leadId });
    if (dedupeKey) {
      seenKeys.add(dedupeKey);
      existingByKey.set(dedupeKey, {
        id: leadId,
        contactId,
        name,
        company,
        email: incomingEmail,
      });
    }
  }

  return { newAccounts, toInsert, toUpdateEmail, skipped };
}

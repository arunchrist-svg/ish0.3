import { eq, inArray } from "drizzle-orm";
import { accounts, contacts, db, leads } from "@/db";
import { logAudit } from "@/lib/audit";
import { isPlausibleJobTitle } from "@/lib/enrichment/job-title";
import { personTitleConflictsWithCompany } from "@/lib/enrichment/person-company-match";
import { parseName } from "@/lib/enrichment/provider-utils";
import {
  formatCompanyDisplayName,
  formatPersonDisplayName,
  needsLetterCasingFix,
} from "@/lib/leads/display-name-format";
import { withLeadVisibility } from "@/lib/leads/lead-visibility";
import type { TenantContext } from "@/lib/tenant";

export type FixLeadNamesResult = {
  scanned: number;
  contactsUpdated: number;
  accountsUpdated: number;
  titlesCleared: number;
  namesFixed: number;
  companiesFixed: number;
};

type VisibilityCtx = Pick<TenantContext, "userId" | "role" | "platformRole">;

/**
 * Clear implausible / conflicting job titles and fix ALL CAPS or all-lowercase
 * person and company names for leads visible to the actor.
 */
export async function fixLeadNames(params: {
  tenantId: string;
  workspaceId: string;
  actorId: string;
  visibilityCtx?: VisibilityCtx;
}): Promise<FixLeadNamesResult> {
  const { tenantId, workspaceId, actorId, visibilityCtx } = params;

  const rows = await db
    .select({
      leadId: leads.id,
      contactId: contacts.id,
      accountId: accounts.id,
      name: contacts.name,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      title: contacts.title,
      companyName: accounts.name,
    })
    .from(leads)
    .innerJoin(contacts, eq(leads.contactId, contacts.id))
    .innerJoin(accounts, eq(leads.accountId, accounts.id))
    .where(
      visibilityCtx
        ? withLeadVisibility(visibilityCtx, eq(leads.tenantId, tenantId), eq(leads.workspaceId, workspaceId))
        : eq(leads.tenantId, tenantId),
    );

  const contactUpdates = new Map<
    string,
    { name?: string; firstName?: string | null; lastName?: string | null; title?: string | null }
  >();
  const accountUpdates = new Map<string, string>();

  let titlesCleared = 0;
  let namesFixed = 0;
  let companiesFixed = 0;

  for (const row of rows) {
    if (!contactUpdates.has(row.contactId)) {
      const nextName = formatPersonDisplayName(row.name);
      const nameChanged = nextName !== row.name.trim();

      let nextFirst = row.firstName;
      let nextLast = row.lastName;
      let namePartsChanged = false;

      if (nameChanged) {
        const parsed = parseName(nextName);
        nextFirst = parsed.firstName || null;
        nextLast = parsed.lastName || null;
        namePartsChanged = true;
      } else {
        const fixedFirst =
          row.firstName && needsLetterCasingFix(row.firstName)
            ? formatPersonDisplayName(row.firstName)
            : row.firstName;
        const fixedLast =
          row.lastName && needsLetterCasingFix(row.lastName)
            ? formatPersonDisplayName(row.lastName)
            : row.lastName;
        if (fixedFirst !== row.firstName || fixedLast !== row.lastName) {
          nextFirst = fixedFirst;
          nextLast = fixedLast;
          namePartsChanged = true;
        }
      }

      const titleBad =
        Boolean(row.title?.trim()) &&
        (!isPlausibleJobTitle(row.title) ||
          personTitleConflictsWithCompany(row.title, row.companyName));

      if (nameChanged || namePartsChanged || titleBad) {
        if (nameChanged || namePartsChanged) namesFixed += 1;
        if (titleBad) titlesCleared += 1;
        contactUpdates.set(row.contactId, {
          ...(nameChanged ? { name: nextName } : {}),
          ...(namePartsChanged ? { firstName: nextFirst, lastName: nextLast } : {}),
          ...(titleBad ? { title: null } : {}),
        });
      }
    }

    if (!accountUpdates.has(row.accountId)) {
      const nextCompany = formatCompanyDisplayName(row.companyName);
      if (nextCompany !== row.companyName.trim()) {
        accountUpdates.set(row.accountId, nextCompany);
        companiesFixed += 1;
      }
    }
  }

  const now = new Date();

  for (const [contactId, patch] of contactUpdates) {
    await db
      .update(contacts)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.firstName !== undefined ? { firstName: patch.firstName } : {}),
        ...(patch.lastName !== undefined ? { lastName: patch.lastName } : {}),
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        updatedAt: now,
      })
      .where(eq(contacts.id, contactId));
  }

  for (const [accountId, name] of accountUpdates) {
    await db
      .update(accounts)
      .set({ name, updatedAt: now })
      .where(eq(accounts.id, accountId));
  }

  const contactsUpdated = contactUpdates.size;
  const accountsUpdated = accountUpdates.size;

  if (contactsUpdated > 0 || accountsUpdated > 0) {
    await logAudit({
      tenantId,
      workspaceId,
      actorId,
      action: "lead.names_fixed",
      entityType: "lead",
      entityId: workspaceId,
      metadata: {
        scanned: rows.length,
        contactsUpdated,
        accountsUpdated,
        titlesCleared,
        namesFixed,
        companiesFixed,
        contactIds: [...contactUpdates.keys()].slice(0, 50),
        accountIds: [...accountUpdates.keys()].slice(0, 50),
      },
    });
  }

  return {
    scanned: rows.length,
    contactsUpdated,
    accountsUpdated,
    titlesCleared,
    namesFixed,
    companiesFixed,
  };
}

/** CLI helper: fix every workspace for the given tenant ids (no visibility filter). */
export async function fixLeadNamesForTenants(tenantIds: string[]): Promise<FixLeadNamesResult> {
  if (!tenantIds.length) {
    return {
      scanned: 0,
      contactsUpdated: 0,
      accountsUpdated: 0,
      titlesCleared: 0,
      namesFixed: 0,
      companiesFixed: 0,
    };
  }

  const workspaceRows = await db
    .select({
      tenantId: leads.tenantId,
      workspaceId: leads.workspaceId,
    })
    .from(leads)
    .where(inArray(leads.tenantId, tenantIds));

  const pairs = new Map<string, { tenantId: string; workspaceId: string }>();
  for (const row of workspaceRows) {
    pairs.set(`${row.tenantId}:${row.workspaceId}`, {
      tenantId: row.tenantId,
      workspaceId: row.workspaceId,
    });
  }

  const totals: FixLeadNamesResult = {
    scanned: 0,
    contactsUpdated: 0,
    accountsUpdated: 0,
    titlesCleared: 0,
    namesFixed: 0,
    companiesFixed: 0,
  };

  for (const pair of pairs.values()) {
    const result = await fixLeadNames({
      tenantId: pair.tenantId,
      workspaceId: pair.workspaceId,
      actorId: "script",
    });
    totals.scanned += result.scanned;
    totals.contactsUpdated += result.contactsUpdated;
    totals.accountsUpdated += result.accountsUpdated;
    totals.titlesCleared += result.titlesCleared;
    totals.namesFixed += result.namesFixed;
    totals.companiesFixed += result.companiesFixed;
  }

  return totals;
}

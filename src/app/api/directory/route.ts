import { NextResponse } from "next/server";
import { db, leads, contacts, accounts } from "@/db";
import { eq, desc, or, like, and } from "drizzle-orm";
import { requireTenantContext } from "@/lib/tenant";

const SCOUT_SOURCES = ["scout", "scout_wizard", "scout_agent"];

type AccountRow = typeof accounts.$inferSelect;

type DirectoryCompanyEntry = {
  id: string;
  name: string;
  city: string;
  industry: string;
  employees: string;
  fitScore: number;
  domain?: string;
  website?: string;
  companyOverview?: AccountRow["companyOverview"];
  overviewEnrichedAt?: string;
  createdAt: string;
  updatedAt: string;
  contacts: {
    leadId: string;
    contactId: string;
    name: string;
    title: string;
    email: string;
    emailStatus: string;
    phone?: string;
    linkedIn?: string;
    status: string;
    leadSource: string;
    score: number;
    savedAt: string;
    isKeyDM: boolean;
  }[];
};

function blankLabel(value: string | null | undefined, fallback = "Unknown"): string {
  const t = value?.trim() ?? "";
  if (!t || t === "—" || t === "-" || /^n\/?a$/i.test(t)) return fallback;
  return t;
}

function accountToDirectoryCompany(account: AccountRow): DirectoryCompanyEntry {
  return {
    id: account.id,
    name: account.name,
    city: blankLabel(account.city),
    industry: blankLabel(account.industry),
    employees: blankLabel(account.employees, "Unknown"),
    fitScore: account.fitScore ?? 60,
    domain: account.domain ?? undefined,
    website: account.website ?? undefined,
    companyOverview: account.companyOverview ?? undefined,
    overviewEnrichedAt: account.overviewEnrichedAt?.toISOString(),
    createdAt: account.createdAt.toISOString(),
    updatedAt: account.updatedAt.toISOString(),
    contacts: [],
  };
}

function isSampleAccount(dataSource: string | null | undefined): boolean {
  return (dataSource ?? "").toLowerCase() === "sample";
}

export async function GET() {
  try {
    const ctx = await requireTenantContext();
    const rows = await db
      .select({
        lead: leads,
        contact: contacts,
        account: accounts,
      })
      .from(leads)
      .innerJoin(contacts, eq(contacts.id, leads.contactId))
      .innerJoin(accounts, eq(accounts.id, leads.accountId))
      .where(
        and(
          eq(leads.tenantId, ctx.tenantId),
          eq(leads.workspaceId, ctx.workspaceId),
          or(
            ...SCOUT_SOURCES.map((s) => eq(leads.leadSource, s)),
            like(leads.leadSource, "scout%"),
          ),
        ),
      )
      .orderBy(desc(leads.createdAt));

    const companyMap = new Map<string, DirectoryCompanyEntry>();

    const allContacts: {
      leadId: string;
      contactId: string;
      name: string;
      title: string;
      email: string;
      emailStatus: string;
      phone?: string;
      linkedIn?: string;
      status: string;
      leadSource: string;
      score: number;
      savedAt: string;
      companyId: string;
      companyName: string;
      companyCity: string;
      companyIndustry: string;
    }[] = [];

    for (const row of rows) {
      const accountId = row.account.id;
      if (!companyMap.has(accountId)) {
        companyMap.set(accountId, accountToDirectoryCompany(row.account));
      }

      const contactEntry = {
        leadId: row.lead.id,
        contactId: row.contact.id,
        name: row.contact.name,
        title: blankLabel(row.contact.title, "Unknown"),
        email: blankLabel(row.contact.email, "Unknown"),
        emailStatus: row.contact.emailStatus ?? "missing",
        phone: row.contact.phone ?? undefined,
        linkedIn: row.contact.linkedIn ?? undefined,
        status: row.lead.status,
        leadSource: row.lead.leadSource ?? "scout",
        score: row.lead.score ?? 60,
        savedAt: row.lead.createdAt.toISOString(),
        isKeyDM: row.contact.isKeyDM ?? false,
      };

      companyMap.get(accountId)!.contacts.push(contactEntry);
      allContacts.push({
        ...contactEntry,
        companyId: accountId,
        companyName: row.account.name,
        companyCity: blankLabel(row.account.city),
        companyIndustry: blankLabel(row.account.industry),
      });
    }

    const savedAccounts = await db
      .select()
      .from(accounts)
      .where(
        and(eq(accounts.tenantId, ctx.tenantId), eq(accounts.workspaceId, ctx.workspaceId)),
      )
      .orderBy(desc(accounts.updatedAt));

    for (const account of savedAccounts) {
      if (isSampleAccount(account.dataSource)) continue;
      if (companyMap.has(account.id)) continue;
      companyMap.set(account.id, accountToDirectoryCompany(account));
    }

    const companies = Array.from(companyMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );

    return NextResponse.json({
      companies,
      contacts: allContacts,
      totals: {
        companies: companies.length,
        contacts: allContacts.length,
      },
    });
  } catch (e) {
    console.error("[api/directory]", e);
    return NextResponse.json({ error: "Failed to load directory" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { db, leads, contacts, accounts } from "@/db";
import { eq, desc, or, like } from "drizzle-orm";

const SCOUT_SOURCES = ["scout", "scout_wizard", "scout_agent"];

export async function GET() {
  try {
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
        or(
          ...SCOUT_SOURCES.map((s) => eq(leads.leadSource, s)),
          like(leads.leadSource, "scout%"),
        ),
      )
      .orderBy(desc(leads.createdAt));

    const companyMap = new Map<
      string,
      {
        id: string;
        name: string;
        city: string;
        industry: string;
        employees: string;
        giftScore: number;
        domain?: string;
        website?: string;
        companyOverview?: unknown;
        overviewEnrichedAt?: string;
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
      }
    >();

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
        companyMap.set(accountId, {
          id: accountId,
          name: row.account.name,
          city: row.account.city ?? "—",
          industry: row.account.industry ?? "—",
          employees: row.account.employees ?? "—",
          giftScore: row.account.giftScore ?? 60,
          domain: row.account.domain ?? undefined,
          website: row.account.website ?? undefined,
          companyOverview: row.account.companyOverview ?? undefined,
          overviewEnrichedAt: row.account.overviewEnrichedAt?.toISOString(),
          contacts: [],
        });
      }

      const contactEntry = {
        leadId: row.lead.id,
        contactId: row.contact.id,
        name: row.contact.name,
        title: row.contact.title ?? "—",
        email: row.contact.email ?? "—",
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
        companyCity: row.account.city ?? "—",
        companyIndustry: row.account.industry ?? "—",
      });
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

import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { db } from "@/db";
import { contacts, accounts, leads } from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";

const CONTACTS_PAGE_LIMIT = 500;

export async function GET() {
  try {
    const ctx = await requireTenantContext();
    const rows = await db
      .select({
        id: contacts.id,
        name: contacts.name,
        title: contacts.title,
        email: contacts.email,
        emailStatus: contacts.emailStatus,
        phone: contacts.phone,
        linkedIn: contacts.linkedIn,
        isKeyDM: contacts.isKeyDM,
        company: accounts.name,
        companyId: accounts.id,
        city: accounts.city,
        industry: accounts.industry,
        leadId: leads.id,
        score: leads.score,
        status: leads.status,
      })
      .from(contacts)
      .innerJoin(accounts, eq(contacts.accountId, accounts.id))
      .leftJoin(
        leads,
        and(eq(leads.contactId, contacts.id), eq(leads.workspaceId, ctx.workspaceId)),
      )
      .where(eq(contacts.tenantId, ctx.tenantId))
      .orderBy(desc(contacts.createdAt), desc(leads.createdAt))
      .limit(CONTACTS_PAGE_LIMIT);

    const seen = new Set<string>();
    const result = [];
    for (const r of rows) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      result.push({
        ...r,
        title: r.title ?? "—",
        email: r.email ?? "—",
        emailStatus: r.emailStatus ?? "missing",
        hasLead: !!r.leadId,
      });
    }

    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, max-age=30" },
    });
  } catch (err) {
    console.error("GET /api/contacts error:", err);
    return NextResponse.json({ error: "Failed to fetch contacts" }, { status: 500 });
  }
}

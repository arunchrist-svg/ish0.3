import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { db } from "@/db";
import { contacts, accounts, leads } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

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
      .leftJoin(leads, eq(leads.contactId, contacts.id))
      .where(eq(contacts.tenantId, ctx.tenantId))
      .orderBy(desc(contacts.createdAt));

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

    return NextResponse.json(result);
  } catch (err) {
    console.error("GET /api/contacts error:", err);
    return NextResponse.json({ error: "Failed to fetch contacts" }, { status: 500 });
  }
}

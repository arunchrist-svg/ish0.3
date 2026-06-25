import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { db } from "@/db";
import { contacts, accounts, leads } from "@/db/schema";
import { eq, desc, sql } from "drizzle-orm";

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
        leadId: sql<string | null>`(SELECT id FROM leads WHERE contact_id = ${contacts.id} LIMIT 1)`,
        score: sql<number | null>`(SELECT score FROM leads WHERE contact_id = ${contacts.id} LIMIT 1)`,
        status: sql<string | null>`(SELECT status FROM leads WHERE contact_id = ${contacts.id} LIMIT 1)`,
      })
      .from(contacts)
      .innerJoin(accounts, eq(contacts.accountId, accounts.id))
      .where(eq(contacts.tenantId, ctx.tenantId))
      .orderBy(desc(contacts.createdAt));

    const result = rows.map((r) => ({
      ...r,
      title: r.title ?? "—",
      email: r.email ?? "—",
      emailStatus: r.emailStatus ?? "missing",
      hasLead: !!r.leadId,
    }));

    return NextResponse.json(result);
  } catch (err) {
    console.error("GET /api/contacts error:", err);
    return NextResponse.json({ error: "Failed to fetch contacts" }, { status: 500 });
  }
}

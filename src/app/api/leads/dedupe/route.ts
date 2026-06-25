import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { handleApiError } from "@/lib/api-errors";
import { db, leads, contacts, accounts } from "@/db";
import { eq, desc } from "drizzle-orm";

/** Lightweight lead list for scouting dedupe — id, name, company only. */
export async function GET() {
  try {
    const ctx = await requireTenantContext();
    const rows = await db
      .select({
        id: leads.id,
        name: contacts.name,
        company: accounts.name,
      })
      .from(leads)
      .innerJoin(contacts, eq(contacts.id, leads.contactId))
      .innerJoin(accounts, eq(accounts.id, leads.accountId))
      .where(eq(leads.tenantId, ctx.tenantId))
      .orderBy(desc(leads.createdAt))
      .limit(500);

    return NextResponse.json(
      { leads: rows },
      { headers: { "Cache-Control": "private, max-age=30" } },
    );
  } catch (e) {
    return handleApiError(e, "[api/leads/dedupe]");
  }
}

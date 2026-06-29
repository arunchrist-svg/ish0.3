import { NextResponse } from "next/server";
import { db, leads, contacts, accounts } from "@/db";
import { eq } from "drizzle-orm";
import { requireTenantContext } from "@/lib/tenant";
import { handleApiError } from "@/lib/api-errors";
import { generateEmailPermutationsForContact } from "@/lib/enrichment/email-permutations";
import { requirePipelineWrite } from "@/lib/auth/permissions";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireTenantContext();
    requirePipelineWrite(ctx);
    const { id } = await params;

    const rows = await db
      .select({ lead: leads, contact: contacts, account: accounts })
      .from(leads)
      .innerJoin(contacts, eq(contacts.id, leads.contactId))
      .innerJoin(accounts, eq(accounts.id, leads.accountId))
      .where(eq(leads.id, id))
      .limit(1);

    if (!rows.length || rows[0].lead.tenantId !== ctx.tenantId) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const { contact, account } = rows[0];
    const result = generateEmailPermutationsForContact({
      firstName: contact.firstName,
      lastName: contact.lastName,
      name: contact.name,
      domain: account.domain,
      website: account.website,
      companyName: account.name,
    });

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (e) {
    return handleApiError(e, "[leads/emails/suggest]");
  }
}

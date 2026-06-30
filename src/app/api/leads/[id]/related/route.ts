import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { db, leads } from "@/db";
import { eq } from "drizzle-orm";
import { findRelatedLeads } from "@/lib/enrichment/related-leads";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireTenantContext();
    const { id } = await params;

    const lead = await db.query.leads.findFirst({
      where: eq(leads.id, id),
      with: { contact: true, account: true },
    });
    if (!lead || lead.tenantId !== ctx.tenantId) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const related = await findRelatedLeads({
      tenantId: ctx.tenantId,
      workspaceId: ctx.workspaceId,
      companyName: lead.account.name,
      companyDomain: lead.account.domain ?? undefined,
      primaryPersonName: lead.contact.name,
      title: lead.contact.title,
      industry: lead.account.industry,
      city: lead.account.city ?? undefined,
      excludeAccountId: lead.account.id,
    });

    return NextResponse.json({ related });
  } catch (err) {
    console.error("GET /api/leads/[id]/related", err);
    return NextResponse.json({ error: "Failed to load related leads" }, { status: 500 });
  }
}

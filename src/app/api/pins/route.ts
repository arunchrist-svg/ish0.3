import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { db } from "@/db";
import { leads, accounts, contacts } from "@/db/schema";
import { eq, desc, sql, and } from "drizzle-orm";
import { requirePipelineWrite } from "@/lib/auth/permissions";

export async function GET() {
  try {
    const ctx = await requireTenantContext();
    const pinnedLeads = await db
      .select({
        id: leads.id,
        type: sql<string>`'lead'`,
        name: contacts.name,
        title: contacts.title,
        company: accounts.name,
        city: accounts.city,
        score: leads.score,
        status: leads.status,
        email: contacts.email,
        emailStatus: contacts.emailStatus,
        isPinned: leads.isPinned,
        updatedAt: leads.updatedAt,
      })
      .from(leads)
      .innerJoin(contacts, eq(leads.contactId, contacts.id))
      .innerJoin(accounts, eq(leads.accountId, accounts.id))
      .where(and(eq(leads.tenantId, ctx.tenantId), eq(leads.isPinned, true)))
      .orderBy(desc(leads.updatedAt));

    const pinnedAccounts = await db
      .select({
        id: accounts.id,
        type: sql<string>`'company'`,
        name: accounts.name,
        industry: accounts.industry,
        city: accounts.city,
        employees: accounts.employees,
        giftScore: accounts.giftScore,
        isPinned: accounts.isPinned,
        updatedAt: accounts.updatedAt,
      })
      .from(accounts)
      .where(and(eq(accounts.tenantId, ctx.tenantId), eq(accounts.isPinned, true)))
      .orderBy(desc(accounts.updatedAt));

    return NextResponse.json({
      leads: pinnedLeads,
      companies: pinnedAccounts,
    });
  } catch (err) {
    console.error("GET /api/pins error:", err);
    return NextResponse.json({ error: "Failed to fetch pinned items" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireTenantContext();
    requirePipelineWrite(ctx);
    const { type, id, pinned } = await req.json();

    if (type === "lead") {
      await db.update(leads).set({ isPinned: pinned }).where(and(eq(leads.id, id), eq(leads.tenantId, ctx.tenantId)));
    } else if (type === "company") {
      await db.update(accounts).set({ isPinned: pinned }).where(and(eq(accounts.id, id), eq(accounts.tenantId, ctx.tenantId)));
    } else {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("POST /api/pins error:", err);
    return NextResponse.json({ error: "Failed to update pin status" }, { status: 500 });
  }
}

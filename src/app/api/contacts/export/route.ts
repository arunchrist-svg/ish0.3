import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { db, contacts, accounts, leads } from "@/db";
import { eq, desc } from "drizzle-orm";
import { logAudit } from "@/lib/audit";

function csvEscape(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

export async function GET(req: Request) {
  try {
    const ctx = await requireTenantContext();
    const { searchParams } = new URL(req.url);
    const search = (searchParams.get("search") ?? "").toLowerCase();
    const hasLead = searchParams.get("hasLead");

    const rows = await db
      .select({
        name: contacts.name,
        title: contacts.title,
        email: contacts.email,
        phone: contacts.phone,
        linkedIn: contacts.linkedIn,
        company: accounts.name,
        city: accounts.city,
        industry: accounts.industry,
        leadStatus: leads.status,
        leadScore: leads.score,
        createdAt: contacts.createdAt,
        leadId: leads.id,
        contactId: contacts.id,
      })
      .from(contacts)
      .innerJoin(accounts, eq(contacts.accountId, accounts.id))
      .leftJoin(leads, eq(leads.contactId, contacts.id))
      .where(eq(contacts.tenantId, ctx.tenantId))
      .orderBy(desc(contacts.createdAt));

    const seen = new Set<string>();
    let filtered = rows.filter((r) => {
      if (seen.has(r.contactId)) return false;
      seen.add(r.contactId);
      return true;
    });

    if (search) {
      filtered = filtered.filter(
        (r) =>
          r.name.toLowerCase().includes(search) ||
          (r.company ?? "").toLowerCase().includes(search) ||
          (r.title ?? "").toLowerCase().includes(search) ||
          (r.email ?? "").toLowerCase().includes(search),
      );
    }
    if (hasLead === "true") filtered = filtered.filter((r) => !!r.leadId);
    if (hasLead === "false") filtered = filtered.filter((r) => !r.leadId);

    const header = "name,title,company,email,phone,linkedin,lead_status,lead_score,seniority,city,industry,created_at";
    const lines = filtered.map((r) =>
      [
        r.name,
        r.title ?? "",
        r.company ?? "",
        r.email ?? "",
        r.phone ?? "",
        r.linkedIn ?? "",
        r.leadStatus ?? "",
        r.leadScore != null ? String(r.leadScore) : "",
        "",
        r.city ?? "",
        r.industry ?? "",
        r.createdAt ? new Date(r.createdAt).toISOString() : "",
      ]
        .map((v) => csvEscape(String(v)))
        .join(","),
    );

    const csv = "\uFEFF" + [header, ...lines].join("\n");

    await logAudit({
      tenantId: ctx.tenantId,
      workspaceId: ctx.workspaceId,
      action: "contacts.exported",
      entityType: "contacts",
      metadata: { rowCount: filtered.length },
    });

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="contacts-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (err) {
    console.error("GET /api/contacts/export", err);
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}

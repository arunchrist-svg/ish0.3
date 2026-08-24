import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { db } from "@/db";
import { contacts, accounts, leads } from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { decodeCursor, keysetBefore, nextCursorFromRows, parseListLimit } from "@/lib/api/cursor";
import { mark, startTiming, withServerTiming } from "@/lib/perf/server-timing";

export const preferredRegion = ["sin1"];

export async function GET(req: Request) {
  const { marks, t0 } = startTiming();
  try {
    const authStart = performance.now();
    const ctx = await requireTenantContext();
    mark(marks, "auth", authStart);

    const { searchParams } = new URL(req.url);
    const limit = parseListLimit(searchParams.get("limit"));
    const cursor = decodeCursor(searchParams.get("cursor"));

    const whereParts = [eq(contacts.tenantId, ctx.tenantId)];
    const keyset = keysetBefore(contacts.createdAt, contacts.id, cursor);
    if (keyset) whereParts.push(keyset);

    const dbStart = performance.now();
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
        createdAt: contacts.createdAt,
      })
      .from(contacts)
      .innerJoin(accounts, eq(contacts.accountId, accounts.id))
      .leftJoin(
        leads,
        and(eq(leads.contactId, contacts.id), eq(leads.workspaceId, ctx.workspaceId)),
      )
      .where(and(...whereParts))
      .orderBy(desc(contacts.createdAt), desc(contacts.id))
      .limit(limit);
    mark(marks, "db", dbStart);

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

    const nextCursor = nextCursorFromRows(
      rows.map((r) => ({ id: r.id, createdAt: r.createdAt })),
      limit,
    );

    const res = NextResponse.json(
      { contacts: result, nextCursor },
      { headers: { "Cache-Control": "private, max-age=30" } },
    );
    return withServerTiming(res, marks, t0);
  } catch (err) {
    console.error("GET /api/contacts error:", err);
    return NextResponse.json({ error: "Failed to fetch contacts" }, { status: 500 });
  }
}

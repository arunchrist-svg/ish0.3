import { NextResponse } from "next/server";
import { db, leads, contacts, accounts } from "@/db";
import { eq, desc, and, or, like } from "drizzle-orm";
import { requireTenantContext } from "@/lib/tenant";
import { decodeCursor, keysetBefore, nextCursorFromRows, parseListLimit } from "@/lib/api/cursor";
import { mark, startTiming, withServerTiming } from "@/lib/perf/server-timing";

export const preferredRegion = ["sin1"];

const SCOUT_SOURCES = ["scout", "scout_wizard", "scout_agent"];

function blankLabel(value: string | null | undefined, fallback = "Unknown"): string {
  const t = value?.trim() ?? "";
  if (!t || t === "—" || t === "-" || /^n\/?a$/i.test(t)) return fallback;
  return t;
}

/** Paginated contacts for directory. Optional companyId filter. */
export async function GET(req: Request) {
  const { marks, t0 } = startTiming();
  try {
    const authStart = performance.now();
    const ctx = await requireTenantContext();
    mark(marks, "auth", authStart);

    const { searchParams } = new URL(req.url);
    const companyId = searchParams.get("companyId");
    const limit = parseListLimit(searchParams.get("limit"));
    const cursor = decodeCursor(searchParams.get("cursor"));

    const whereParts = [
      eq(leads.tenantId, ctx.tenantId),
      eq(leads.workspaceId, ctx.workspaceId),
    ];
    if (companyId) {
      whereParts.push(eq(leads.accountId, companyId));
    } else {
      whereParts.push(
        or(
          ...SCOUT_SOURCES.map((s) => eq(leads.leadSource, s)),
          like(leads.leadSource, "scout%"),
        )!,
      );
    }
    const keyset = keysetBefore(leads.createdAt, leads.id, cursor);
    if (keyset) whereParts.push(keyset);

    const dbStart = performance.now();
    const rows = await db
      .select({
        leadId: leads.id,
        contactId: contacts.id,
        name: contacts.name,
        title: contacts.title,
        email: contacts.email,
        emailStatus: contacts.emailStatus,
        phone: contacts.phone,
        linkedIn: contacts.linkedIn,
        status: leads.status,
        leadSource: leads.leadSource,
        score: leads.score,
        savedAt: leads.createdAt,
        isKeyDM: contacts.isKeyDM,
        companyId: accounts.id,
        companyName: accounts.name,
        companyCity: accounts.city,
        companyIndustry: accounts.industry,
      })
      .from(leads)
      .innerJoin(contacts, eq(contacts.id, leads.contactId))
      .innerJoin(accounts, eq(accounts.id, leads.accountId))
      .where(and(...whereParts))
      .orderBy(desc(leads.createdAt), desc(leads.id))
      .limit(limit);
    mark(marks, "db", dbStart);

    const contactsOut = rows.map((row) => ({
      leadId: row.leadId,
      contactId: row.contactId,
      name: row.name,
      title: blankLabel(row.title, "Unknown"),
      email: blankLabel(row.email, "Unknown"),
      emailStatus: row.emailStatus ?? "missing",
      phone: row.phone ?? undefined,
      linkedIn: row.linkedIn ?? undefined,
      status: row.status,
      leadSource: row.leadSource ?? "scout",
      score: row.score ?? 60,
      savedAt: row.savedAt.toISOString(),
      isKeyDM: row.isKeyDM ?? false,
      companyId: row.companyId,
      companyName: row.companyName,
      companyCity: blankLabel(row.companyCity),
      companyIndustry: blankLabel(row.companyIndustry),
    }));

    const nextCursor = nextCursorFromRows(
      rows.map((r) => ({ id: r.leadId, createdAt: r.savedAt })),
      limit,
    );

    const res = NextResponse.json({ contacts: contactsOut, nextCursor });
    return withServerTiming(res, marks, t0);
  } catch (e) {
    console.error("[api/directory/contacts]", e);
    return NextResponse.json({ error: "Failed to load contacts" }, { status: 500 });
  }
}

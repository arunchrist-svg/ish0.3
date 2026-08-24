import { NextResponse } from "next/server";
import { db, accounts } from "@/db";
import { eq, desc, and, sql, or, lt } from "drizzle-orm";
import { requireTenantContext } from "@/lib/tenant";
import {
  decodeCursor,
  nextCursorFromRows,
  parseListLimit,
} from "@/lib/api/cursor";
import { mark, startTiming, withServerTiming } from "@/lib/perf/server-timing";

export const preferredRegion = ["sin1"];

function blankLabel(value: string | null | undefined, fallback = "Unknown"): string {
  const t = value?.trim() ?? "";
  if (!t || t === "—" || t === "-" || /^n\/?a$/i.test(t)) return fallback;
  return t;
}

function isSampleAccount(dataSource: string | null | undefined): boolean {
  return (dataSource ?? "").toLowerCase() === "sample";
}

/** Thin company directory page. Contacts load via /api/directory/contacts?companyId= */
export async function GET(req: Request) {
  const { marks, t0 } = startTiming();
  try {
    const authStart = performance.now();
    const ctx = await requireTenantContext();
    mark(marks, "auth", authStart);

    const { searchParams } = new URL(req.url);
    const limit = parseListLimit(searchParams.get("limit"));
    const cursor = decodeCursor(searchParams.get("cursor"));
    const includeTotal = searchParams.get("totals") !== "0";

    const whereParts = [
      eq(accounts.tenantId, ctx.tenantId),
      eq(accounts.workspaceId, ctx.workspaceId),
    ];
    if (cursor) {
      whereParts.push(
        or(
          lt(accounts.updatedAt, cursor.createdAt),
          and(eq(accounts.updatedAt, cursor.createdAt), lt(accounts.id, cursor.id)),
        )!,
      );
    }

    const dbStart = performance.now();
    const [rows, totalRow] = await Promise.all([
      db
        .select({
          id: accounts.id,
          name: accounts.name,
          city: accounts.city,
          industry: accounts.industry,
          employees: accounts.employees,
          fitScore: accounts.fitScore,
          domain: accounts.domain,
          website: accounts.website,
          logo: accounts.logo,
          dataSource: accounts.dataSource,
          createdAt: accounts.createdAt,
          updatedAt: accounts.updatedAt,
        })
        .from(accounts)
        .where(and(...whereParts))
        .orderBy(desc(accounts.updatedAt), desc(accounts.id))
        .limit(limit * 2),
      includeTotal
        ? db
            .select({ n: sql<number>`count(*)::int` })
            .from(accounts)
            .where(
              and(
                eq(accounts.tenantId, ctx.tenantId),
                eq(accounts.workspaceId, ctx.workspaceId),
              ),
            )
            .then((r) => r[0]?.n ?? 0)
        : Promise.resolve(undefined),
    ]);
    mark(marks, "db", dbStart);

    const companies = [];
    for (const account of rows) {
      if (isSampleAccount(account.dataSource)) continue;
      companies.push({
        id: account.id,
        name: account.name,
        city: blankLabel(account.city),
        industry: blankLabel(account.industry),
        employees: blankLabel(account.employees, "Unknown"),
        fitScore: account.fitScore ?? 60,
        domain: account.domain ?? undefined,
        website: account.website ?? undefined,
        logo: account.logo ?? undefined,
        createdAt: account.createdAt.toISOString(),
        updatedAt: account.updatedAt.toISOString(),
        contacts: [] as never[],
      });
      if (companies.length >= limit) break;
    }

    const nextCursor = nextCursorFromRows(
      companies.slice(0, limit).map((c) => ({
        id: c.id,
        createdAt: c.updatedAt,
      })),
      limit,
    );

    const res = NextResponse.json({
      companies,
      contacts: [],
      nextCursor,
      totals: {
        companies: totalRow ?? companies.length,
        contacts: 0,
      },
    });
    return withServerTiming(res, marks, t0);
  } catch (e) {
    console.error("[api/directory]", e);
    return NextResponse.json({ error: "Failed to load directory" }, { status: 500 });
  }
}

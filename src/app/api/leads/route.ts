import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { handleApiError } from "@/lib/api-errors";
import { db, leads, contacts, accounts, users } from "@/db";
import { eq, desc, inArray, and, sql } from "drizzle-orm";
import type { LeadQueueItem } from "@/lib/api-client";
import { deriveQueueAction } from "@/lib/pipeline-status";
import { requirePipelineWrite } from "@/lib/auth/permissions";
import { createManualLead } from "@/lib/leads/crud";
import { sanitizeEmail } from "@/lib/enrichment/validate-contact";
import {
  decodeCursor,
  keysetBefore,
  nextCursorFromRows,
  parseListLimit,
} from "@/lib/api/cursor";
import { mark, startTiming, withServerTiming } from "@/lib/perf/server-timing";
import { withLeadVisibility } from "@/lib/leads/lead-visibility";

export const preferredRegion = ["sin1"];

export async function GET(req: Request) {
  const { marks, t0 } = startTiming();
  try {
    const authStart = performance.now();
    const ctx = await requireTenantContext();
    mark(marks, "auth", authStart);

    const { searchParams } = new URL(req.url);
    const statusFilter = searchParams.get("status");
    const statuses = statusFilter ? statusFilter.split(",").filter(Boolean) : null;
    const limit = parseListLimit(searchParams.get("limit"));
    const cursor = decodeCursor(searchParams.get("cursor"));
    const includeTotal = searchParams.get("totals") === "1";

    const whereParts = [eq(leads.tenantId, ctx.tenantId)];
    if (statuses?.length) whereParts.push(inArray(leads.status, statuses));
    const keyset = keysetBefore(leads.createdAt, leads.id, cursor);
    if (keyset) whereParts.push(keyset);
    const listWhere = withLeadVisibility(ctx, ...whereParts);
    const totalWhere = withLeadVisibility(
      ctx,
      eq(leads.tenantId, ctx.tenantId),
      statuses?.length ? inArray(leads.status, statuses) : undefined,
    );

    const dbStart = performance.now();
    const [rows, totalRow] = await Promise.all([
      db
        .select({
          id: leads.id,
          status: leads.status,
          score: leads.score,
          createdAt: leads.createdAt,
          researcherEligible: leads.researcherEligible,
          leadSource: leads.leadSource,
          isPinned: leads.isPinned,
          createdByUserId: leads.createdByUserId,
          createdByName: users.name,
          name: contacts.name,
          title: contacts.title,
          emailStatus: contacts.emailStatus,
          email: contacts.email,
          phone: contacts.phone,
          linkedIn: contacts.linkedIn,
          company: accounts.name,
          companyDomain: accounts.domain,
          employees: accounts.employees,
          city: accounts.city,
        })
        .from(leads)
        .innerJoin(contacts, eq(contacts.id, leads.contactId))
        .innerJoin(accounts, eq(accounts.id, leads.accountId))
        .leftJoin(users, eq(users.id, leads.createdByUserId))
        .where(listWhere)
        .orderBy(desc(leads.createdAt), desc(leads.id))
        .limit(limit),
      includeTotal
        ? db
            .select({ n: sql<number>`count(*)::int` })
            .from(leads)
            .where(totalWhere)
            .then((r) => r[0]?.n ?? 0)
        : Promise.resolve(undefined),
    ]);
    mark(marks, "db", dbStart);

    const queue: LeadQueueItem[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      title: r.title ?? "—",
      company: r.company,
      companyDomain: r.companyDomain ?? undefined,
      employees: r.employees ?? undefined,
      city: r.city ?? "—",
      score: r.score ?? 60,
      status: r.status,
      action: deriveQueueAction(r.status),
      emailStatus: r.emailStatus ?? "missing",
      email: r.email ?? undefined,
      phone: r.phone ?? undefined,
      linkedIn: r.linkedIn ?? undefined,
      leadSource: r.leadSource ?? undefined,
      isPinned: r.isPinned ?? false,
      createdByUserId: r.createdByUserId ?? undefined,
      createdByName: r.createdByName?.trim() || undefined,
      nextActionDate: undefined,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt ?? undefined,
    }));

    const nextCursor = nextCursorFromRows(
      rows.map((r) => ({
        id: r.id,
        createdAt: r.createdAt,
      })),
      limit,
    );

    const res = NextResponse.json({
      leads: queue,
      nextCursor,
      ...(totalRow != null ? { totals: { leads: totalRow } } : {}),
    });
    return withServerTiming(res, marks, t0);
  } catch (e) {
    return handleApiError(e, "[api/leads]");
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireTenantContext();
    requirePipelineWrite(ctx);
    const body = (await req.json()) as {
      name?: string;
      title?: string;
      email?: string;
      phone?: string;
      linkedIn?: string;
      company?: string;
      city?: string;
      industry?: string;
      employees?: string;
      score?: number;
      tags?: string[];
    };

    if (!body.name?.trim() || !body.company?.trim()) {
      return NextResponse.json({ error: "Name and company are required" }, { status: 400 });
    }
    if (body.email?.trim() && !sanitizeEmail(body.email)) {
      return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
    }

    const result = await createManualLead({
      tenantId: ctx.tenantId,
      workspaceId: ctx.workspaceId,
      actorId: ctx.userId,
      name: body.name,
      title: body.title,
      email: body.email,
      phone: body.phone,
      linkedIn: body.linkedIn,
      company: body.company,
      city: body.city,
      industry: body.industry,
      employees: body.employees,
      score: body.score,
      tags: body.tags,
      trustProvidedEmail: true,
    });

    return NextResponse.json(
      { ok: true, id: result.id, existing: result.existing === true },
      { status: result.existing ? 200 : 201 },
    );
  } catch (e) {
    return handleApiError(e, "[api/leads POST]");
  }
}

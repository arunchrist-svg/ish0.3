import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { handleApiError } from "@/lib/api-errors";
import { db, leads, contacts, accounts, users, outreachSchedule } from "@/db";
import { eq, desc, inArray, and, sql, asc } from "drizzle-orm";
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
import { withoutPendingInitialEmailSend } from "@/lib/outreach/pending-send-count";
import { humanRepliedLeadSql } from "@/lib/email/human-reply-filter-sql";
import { INBOUND_REPLY_EMAIL_KIND } from "@/lib/email/inbound-match";
import { outboundCampaignEmailFilter } from "@/lib/email/outbound-campaign";

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
    const sortSentNewest = searchParams.get("sort") === "sent_newest";
    const sortReplyNewest = searchParams.get("sort") === "reply_newest";
    const humanReplyOnly = searchParams.get("humanReply") === "1";
    const cursor =
      sortSentNewest || sortReplyNewest ? null : decodeCursor(searchParams.get("cursor"));
    const includeTotal = searchParams.get("totals") === "1";

    const excludePendingInitial = searchParams.get("excludePendingInitial") === "1";
    const ids = searchParams.get("ids")?.split(",").map((id) => id.trim()).filter(Boolean) ?? [];
    const whereParts = [eq(leads.tenantId, ctx.tenantId)];
    if (statuses?.length) whereParts.push(inArray(leads.status, statuses));
    if (ids.length) whereParts.push(inArray(leads.id, ids.slice(0, 100)));
    if (excludePendingInitial) whereParts.push(withoutPendingInitialEmailSend());
    if (humanReplyOnly) whereParts.push(humanRepliedLeadSql());
    const keyset = keysetBefore(leads.createdAt, leads.id, cursor);
    if (keyset) whereParts.push(keyset);
    const listWhere = withLeadVisibility(ctx, ...whereParts);
    const totalWhere = withLeadVisibility(
      ctx,
      eq(leads.tenantId, ctx.tenantId),
      statuses?.length ? inArray(leads.status, statuses) : undefined,
      humanReplyOnly ? humanRepliedLeadSql() : undefined,
    );

    const listColumns = {
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
    };

    /** Latest live outbound (Email 1, follow-up, catalog), not Email 1 alone. */
    const lastOutboundSent = db
      .select({
        leadId: outreachSchedule.leadId,
        sentAt: sql<Date>`max(${outreachSchedule.sentAt})`.as("last_sent_at"),
      })
      .from(outreachSchedule)
      .where(and(outboundCampaignEmailFilter(), eq(outreachSchedule.sendMode, "live")))
      .groupBy(outreachSchedule.leadId)
      .as("last_outbound_sent");

    const lastHumanReply = db
      .select({
        leadId: outreachSchedule.leadId,
        repliedAt: sql<Date>`max(${outreachSchedule.sentAt})`.as("last_replied_at"),
      })
      .from(outreachSchedule)
      .where(
        and(
          eq(outreachSchedule.channel, "email"),
          eq(outreachSchedule.emailKind, INBOUND_REPLY_EMAIL_KIND),
          eq(outreachSchedule.status, "sent"),
        ),
      )
      .groupBy(outreachSchedule.leadId)
      .as("last_human_reply");

    const listQuery = sortReplyNewest
      ? db
          .select(listColumns)
          .from(leads)
          .leftJoin(contacts, eq(contacts.id, leads.contactId))
          .leftJoin(accounts, eq(accounts.id, leads.accountId))
          .leftJoin(users, eq(users.id, leads.createdByUserId))
          .leftJoin(lastHumanReply, eq(lastHumanReply.leadId, leads.id))
          .where(listWhere)
          .orderBy(sql`${lastHumanReply.repliedAt} desc nulls last`, desc(leads.createdAt), desc(leads.id))
          .limit(limit)
      : sortSentNewest
      ? db
          .select(listColumns)
          .from(leads)
          .leftJoin(contacts, eq(contacts.id, leads.contactId))
          .leftJoin(accounts, eq(accounts.id, leads.accountId))
          .leftJoin(users, eq(users.id, leads.createdByUserId))
          .leftJoin(lastOutboundSent, eq(lastOutboundSent.leadId, leads.id))
          .where(listWhere)
          .orderBy(sql`${lastOutboundSent.sentAt} desc nulls last`, desc(leads.createdAt), desc(leads.id))
          .limit(limit)
      : db
          .select(listColumns)
          .from(leads)
          .leftJoin(contacts, eq(contacts.id, leads.contactId))
          .leftJoin(accounts, eq(accounts.id, leads.accountId))
          .leftJoin(users, eq(users.id, leads.createdByUserId))
          .where(listWhere)
          .orderBy(desc(leads.createdAt), desc(leads.id))
          .limit(limit);

    const dbStart = performance.now();
    const [rows, totalRow] = await Promise.all([
      listQuery,
      includeTotal
        ? db
            .select({ n: sql<number>`count(*)::int` })
            .from(leads)
            .where(totalWhere)
            .then((r) => r[0]?.n ?? 0)
        : Promise.resolve(undefined),
    ]);

    const leadIds = rows.map((r) => r.id);
    const pendingByLead = new Map<
      string,
      { scheduledFor: Date; scheduleId: string; status: string; lastError: string | null }
    >();
    const sentByLead = new Map<string, Date>();
    if (leadIds.length > 0) {
      const [pendingRows, sentRows] = await Promise.all([
        db
          .select({
            id: outreachSchedule.id,
            leadId: outreachSchedule.leadId,
            status: outreachSchedule.status,
            scheduledFor: outreachSchedule.scheduledFor,
            lastError: outreachSchedule.lastError,
          })
          .from(outreachSchedule)
          .where(
            and(
              inArray(outreachSchedule.leadId, leadIds),
              eq(outreachSchedule.channel, "email"),
              eq(outreachSchedule.sequenceDay, 0),
              inArray(outreachSchedule.status, ["scheduled", "sending", "paused"]),
            ),
          )
          .orderBy(asc(outreachSchedule.scheduledFor)),
        db
          .select({
            leadId: outreachSchedule.leadId,
            sentAt: outreachSchedule.sentAt,
          })
          .from(outreachSchedule)
          .where(
            and(
              inArray(outreachSchedule.leadId, leadIds),
              outboundCampaignEmailFilter(),
              eq(outreachSchedule.sendMode, "live"),
            ),
          ),
      ]);

      for (const row of pendingRows) {
        if (!pendingByLead.has(row.leadId)) {
          pendingByLead.set(row.leadId, {
            scheduledFor: row.scheduledFor,
            scheduleId: row.id,
            status: row.status,
            lastError: row.lastError ?? null,
          });
        }
      }
      for (const row of sentRows) {
        if (!row.sentAt) continue;
        const prev = sentByLead.get(row.leadId);
        if (!prev || row.sentAt.getTime() > prev.getTime()) {
          sentByLead.set(row.leadId, row.sentAt);
        }
      }
    }
    mark(marks, "db", dbStart);

    const queue: LeadQueueItem[] = rows.map((r) => {
      const sentAt = sentByLead.get(r.id);
      const pending = sentAt ? undefined : pendingByLead.get(r.id);
      return {
        id: r.id,
        name: r.name?.trim() || "—",
        title: r.title ?? "—",
        company: r.company?.trim() || "—",
        companyDomain: r.companyDomain ?? undefined,
        employees: r.employees ?? undefined,
        city: r.city ?? "—",
        score: r.score ?? 60,
        status: r.status,
        action: pending ? "Queued to send" : deriveQueueAction(r.status),
        emailStatus: r.emailStatus ?? "missing",
        email: r.email ?? undefined,
        phone: r.phone ?? undefined,
        linkedIn: r.linkedIn ?? undefined,
        leadSource: r.leadSource ?? undefined,
        isPinned: r.isPinned ?? false,
        createdByUserId: r.createdByUserId ?? undefined,
        createdByName: r.createdByName?.trim() || undefined,
        nextActionDate: undefined,
        pendingSendScheduledFor: pending ? pending.scheduledFor.toISOString() : undefined,
        pendingSendScheduleId: pending?.scheduleId,
        pendingSendStatus: pending?.status,
        pendingSendLastError: pending?.lastError ?? undefined,
        lastEmailSentAt: sentAt ? sentAt.toISOString() : undefined,
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt ?? undefined,
      };
    });

    const nextCursor = sortSentNewest || sortReplyNewest
      ? null
      : nextCursorFromRows(
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

import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { handleApiError } from "@/lib/api-errors";
import { db, outreachSchedule, leads, contacts, accounts } from "@/db";
import { and, count, desc, eq, ilike, isNotNull, isNull, or, sql } from "drizzle-orm";
import { deriveEmailLogStatus, type EmailLogStatus } from "@/lib/email/log-status";
import { syncResendBounces } from "@/lib/email/sync-resend-bounces";

export type EmailLogRow = {
  id: string;
  leadId: string;
  to: string;
  contactName: string;
  companyName: string;
  subject: string;
  sequenceDay: number;
  sentAt: string | null;
  openedAt: string | null;
  bouncedAt: string | null;
  bounceReason: string | null;
  status: EmailLogStatus;
};

export type EmailLogsResponse = {
  items: EmailLogRow[];
  total: number;
  limit: number;
  offset: number;
  counts: {
    all: number;
    opened: number;
    bounced: number;
    delivered: number;
  };
};

const STATUS_FILTERS = new Set(["all", "opened", "bounced", "delivered"] as const);
type StatusFilter = "all" | "opened" | "bounced" | "delivered";

function parseStatus(raw: string | null): StatusFilter {
  if (raw && STATUS_FILTERS.has(raw as StatusFilter)) return raw as StatusFilter;
  return "all";
}

function parsePage(raw: string | null, fallback: number, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(Math.floor(n), max);
}

export async function GET(req: Request) {
  try {
    const ctx = await requireTenantContext();
    try {
      await syncResendBounces(ctx.workspaceId);
    } catch (error) {
      console.error("[api/email/logs] bounce sync failed", error);
    }
    const { searchParams } = new URL(req.url);
    const status = parseStatus(searchParams.get("status"));
    const q = searchParams.get("q")?.trim() ?? "";
    const limit = parsePage(searchParams.get("limit"), 50, 100) || 50;
    const offset = parsePage(searchParams.get("offset"), 0, 10_000);

    const workspaceFilter = eq(leads.workspaceId, ctx.workspaceId);
    const outboundFilter = and(
      eq(outreachSchedule.status, "sent"),
      eq(outreachSchedule.channel, "email"),
      sql`${outreachSchedule.emailKind} is distinct from 'inbound_reply'`,
    );
    const statusFilter =
      status === "bounced"
        ? isNotNull(outreachSchedule.bouncedAt)
        : status === "opened"
          ? and(isNotNull(outreachSchedule.openedAt), isNull(outreachSchedule.bouncedAt))
          : status === "delivered"
            ? and(isNull(outreachSchedule.openedAt), isNull(outreachSchedule.bouncedAt))
            : undefined;
    const searchFilter = q
      ? or(
          ilike(outreachSchedule.recipientEmail, `%${q}%`),
          ilike(outreachSchedule.subjectSent, `%${q}%`),
          ilike(contacts.email, `%${q}%`),
          ilike(contacts.name, `%${q}%`),
          ilike(accounts.name, `%${q}%`),
        )
      : undefined;

    const filters = [
      workspaceFilter,
      outboundFilter,
      statusFilter,
      searchFilter,
    ].filter((clause): clause is NonNullable<typeof clause> => Boolean(clause));
    const where = and(...filters);

    function joinedCount() {
      return db
        .select({ total: count() })
        .from(outreachSchedule)
        .innerJoin(leads, eq(outreachSchedule.leadId, leads.id))
        .innerJoin(contacts, eq(leads.contactId, contacts.id))
        .innerJoin(accounts, eq(leads.accountId, accounts.id));
    }

    const workspaceAndOutbound = and(workspaceFilter, outboundFilter);

    const [rows, filteredCount, allCount, openedCount, bouncedCount, deliveredCount] = await Promise.all([
      db
        .select({
          id: outreachSchedule.id,
          leadId: outreachSchedule.leadId,
          recipientEmail: outreachSchedule.recipientEmail,
          subjectSent: outreachSchedule.subjectSent,
          sequenceDay: outreachSchedule.sequenceDay,
          sentAt: outreachSchedule.sentAt,
          openedAt: outreachSchedule.openedAt,
          bouncedAt: outreachSchedule.bouncedAt,
          bounceReason: outreachSchedule.bounceReason,
          contactName: contacts.name,
          contactEmail: contacts.email,
          companyName: accounts.name,
        })
        .from(outreachSchedule)
        .innerJoin(leads, eq(outreachSchedule.leadId, leads.id))
        .innerJoin(contacts, eq(leads.contactId, contacts.id))
        .innerJoin(accounts, eq(leads.accountId, accounts.id))
        .where(where)
        .orderBy(desc(sql`coalesce(${outreachSchedule.sentAt}, ${outreachSchedule.scheduledFor})`))
        .limit(limit)
        .offset(offset),
      joinedCount().where(where),
      joinedCount().where(workspaceAndOutbound),
      joinedCount().where(and(workspaceAndOutbound, isNotNull(outreachSchedule.openedAt), isNull(outreachSchedule.bouncedAt))),
      joinedCount().where(and(workspaceAndOutbound, isNotNull(outreachSchedule.bouncedAt))),
      joinedCount().where(and(workspaceAndOutbound, isNull(outreachSchedule.openedAt), isNull(outreachSchedule.bouncedAt))),
    ]);

    const items: EmailLogRow[] = rows.map((row) => ({
      id: row.id,
      leadId: row.leadId,
      to: (row.recipientEmail ?? row.contactEmail ?? "").trim() || "Unknown recipient",
      contactName: row.contactName,
      companyName: row.companyName,
      subject: row.subjectSent?.trim() || "(no subject)",
      sequenceDay: row.sequenceDay,
      sentAt: row.sentAt ? row.sentAt.toISOString() : null,
      openedAt: row.openedAt ? row.openedAt.toISOString() : null,
      bouncedAt: row.bouncedAt ? row.bouncedAt.toISOString() : null,
      bounceReason: row.bounceReason,
      status: deriveEmailLogStatus(row),
    }));

    const payload: EmailLogsResponse = {
      items,
      total: filteredCount[0]?.total ?? 0,
      limit,
      offset,
      counts: {
        all: allCount[0]?.total ?? 0,
        opened: openedCount[0]?.total ?? 0,
        bounced: bouncedCount[0]?.total ?? 0,
        delivered: deliveredCount[0]?.total ?? 0,
      },
    };

    return NextResponse.json(payload);
  } catch (e) {
    return handleApiError(e, "[api/email/logs]");
  }
}

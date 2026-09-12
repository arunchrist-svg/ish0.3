import { NextResponse } from "next/server";
import { and, asc, eq, gt, inArray, or } from "drizzle-orm";
import { db, leads, contacts, accounts, users, outreachSchedule } from "@/db";
import { requireTenantContext } from "@/lib/tenant";
import { handleApiError } from "@/lib/api-errors";
import { withLeadVisibility } from "@/lib/leads/lead-visibility";
import type { LeadQueueItem } from "@/lib/api-client";

export const preferredRegion = ["sin1"];
export const maxDuration = 60;

const MAX_QUEUED_PAGE = 5000;

function decodeScheduledCursor(cursor: string | null): { scheduledFor: Date; id: string } | null {
  if (!cursor?.trim()) return null;
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const sep = raw.lastIndexOf("|");
    if (sep <= 0) return null;
    const scheduledFor = new Date(raw.slice(0, sep));
    const id = raw.slice(sep + 1);
    if (!id || Number.isNaN(scheduledFor.getTime())) return null;
    return { scheduledFor, id };
  } catch {
    return null;
  }
}

function encodeScheduledCursor(scheduledFor: Date, id: string): string {
  return Buffer.from(`${scheduledFor.toISOString()}|${id}`, "utf8").toString("base64url");
}

export async function GET(req: Request) {
  try {
    const ctx = await requireTenantContext();
    const { searchParams } = new URL(req.url);
    const limit = Math.min(
      MAX_QUEUED_PAGE,
      Math.max(1, parseInt(searchParams.get("limit") ?? "200", 10) || 200),
    );
    const cursor = decodeScheduledCursor(searchParams.get("cursor"));

    const where = withLeadVisibility(
      ctx,
      eq(leads.tenantId, ctx.tenantId),
      eq(outreachSchedule.channel, "email"),
      eq(outreachSchedule.sequenceDay, 0),
      inArray(outreachSchedule.status, ["scheduled", "sending", "paused"]),
      cursor
        ? or(
            gt(outreachSchedule.scheduledFor, cursor.scheduledFor),
            and(
              eq(outreachSchedule.scheduledFor, cursor.scheduledFor),
              gt(leads.id, cursor.id),
            ),
          )
        : undefined,
    );

    const rows = await db
      .select({
        id: leads.id,
        status: leads.status,
        score: leads.score,
        createdAt: leads.createdAt,
        createdByUserId: leads.createdByUserId,
        createdByName: users.name,
        name: contacts.name,
        title: contacts.title,
        emailStatus: contacts.emailStatus,
        company: accounts.name,
        employees: accounts.employees,
        city: accounts.city,
        scheduleId: outreachSchedule.id,
        scheduledFor: outreachSchedule.scheduledFor,
        scheduleStatus: outreachSchedule.status,
        lastError: outreachSchedule.lastError,
      })
      .from(outreachSchedule)
      .innerJoin(leads, eq(leads.id, outreachSchedule.leadId))
      .innerJoin(contacts, eq(contacts.id, leads.contactId))
      .innerJoin(accounts, eq(accounts.id, leads.accountId))
      .leftJoin(users, eq(users.id, leads.createdByUserId))
      .where(where)
      .orderBy(asc(outreachSchedule.scheduledFor), asc(leads.id))
      .limit(limit);

    const queue: LeadQueueItem[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      title: r.title ?? "—",
      company: r.company,
      employees: r.employees ?? undefined,
      city: r.city ?? "—",
      score: r.score ?? 60,
      status: r.status,
      action: "Queued to send",
      emailStatus: r.emailStatus ?? "missing",
      createdByUserId: r.createdByUserId ?? undefined,
      createdByName: r.createdByName?.trim() || undefined,
      pendingSendScheduledFor: r.scheduledFor.toISOString(),
      pendingSendScheduleId: r.scheduleId,
      pendingSendStatus: r.scheduleStatus,
      pendingSendLastError: r.lastError ?? undefined,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt ?? undefined,
    }));

    const last = rows[rows.length - 1];
    const nextCursor =
      rows.length >= limit && last
        ? encodeScheduledCursor(last.scheduledFor, last.id)
        : null;

    return NextResponse.json({ leads: queue, nextCursor });
  } catch (e) {
    return handleApiError(e, "[api/leads/queued]");
  }
}

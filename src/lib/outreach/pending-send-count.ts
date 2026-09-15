import { and, eq, inArray, notExists, sql, type SQL } from "drizzle-orm";
import { db, leads, contacts, outreachSchedule } from "@/db";
import { withLeadVisibility } from "@/lib/leads/lead-visibility";
import { STATUSES_BY_STAGE_INDEX } from "@/lib/pipeline-status";
import type { TenantContext } from "@/lib/tenant";

const EMAIL_STAGE_STATUSES = STATUSES_BY_STAGE_INDEX[1] ?? ["draft_ready", "approved"];

/** Email 1 rows that already occupy the Queued column. */
export const PENDING_INITIAL_SEND_STATUSES = ["scheduled", "sending", "paused"] as const;

/** SQL filter: lead has no Email 1 row already in the outbox queue. */
export function withoutPendingInitialEmailSend(): SQL {
  return notExists(
    db
      .select({ id: outreachSchedule.id })
      .from(outreachSchedule)
      .where(
        and(
          eq(outreachSchedule.leadId, leads.id),
          eq(outreachSchedule.channel, "email"),
          eq(outreachSchedule.sequenceDay, 0),
          inArray(outreachSchedule.status, [...PENDING_INITIAL_SEND_STATUSES]),
        ),
      ),
  );
}

/** Inbox Send All can auto-pick: real primary, or a stored alternate (not firstname@ / lastname@). */
export function withLikelySendableContactEmail(): SQL {
  return sql`(
    (
      ${contacts.email} is not null
      and position('@' in ${contacts.email}) > 1
      and ${contacts.email} <> '—'
      and (${contacts.emailStatus} is null or ${contacts.emailStatus} not in ('missing', 'generic'))
      and lower(split_part(${contacts.email}, '@', 1)) not in (
        'firstname', 'lastname', 'first', 'last', 'name', 'user', 'email', 'info', 'admin', 'test'
      )
      and (
        ${contacts.enrichmentSource} is null
        or (
          ${contacts.enrichmentSource} not like '%:first'
          and ${contacts.enrichmentSource} not like '%:last'
        )
      )
    )
    or exists (
      select 1
      from jsonb_array_elements(coalesce(${contacts.alternateEmails}, '[]'::jsonb)) as alt
      where coalesce(alt->>'email', '') <> ''
        and position('@' in alt->>'email') > 1
        and alt->>'email' <> '—'
        and coalesce(alt->>'emailStatus', '') not in ('missing', 'generic', 'bounced')
        and lower(split_part(alt->>'email', '@', 1)) not in (
          'firstname', 'lastname', 'first', 'last', 'name', 'user', 'email', 'info', 'admin', 'test'
        )
        and coalesce(alt->>'pattern', '') not in ('first', 'last')
    )
  )`;
}

export async function countPendingInitialEmailSends(
  ctx: Pick<TenantContext, "tenantId" | "userId" | "role" | "platformRole">,
): Promise<number> {
  const where = withLeadVisibility(
    ctx,
    eq(leads.tenantId, ctx.tenantId),
    inArray(leads.status, EMAIL_STAGE_STATUSES),
    inArray(outreachSchedule.status, [...PENDING_INITIAL_SEND_STATUSES]),
    eq(outreachSchedule.channel, "email"),
    eq(outreachSchedule.sequenceDay, 0),
  );

  const row = await db
    .select({ n: sql<number>`count(distinct ${leads.id})::int` })
    .from(leads)
    .innerJoin(outreachSchedule, eq(outreachSchedule.leadId, leads.id))
    .where(where);

  return row[0]?.n ?? 0;
}

/** Leads in Email that Send All will pick (no queued / paused Email 1). */
export async function countSendableEmailStageLeads(
  ctx: Pick<TenantContext, "tenantId" | "userId" | "role" | "platformRole">,
): Promise<number> {
  const where = withLeadVisibility(
    ctx,
    eq(leads.tenantId, ctx.tenantId),
    inArray(leads.status, EMAIL_STAGE_STATUSES),
    withoutPendingInitialEmailSend(),
  );
  const row = await db.select({ n: sql<number>`count(*)::int` }).from(leads).where(where);
  return row[0]?.n ?? 0;
}

/** Unqueued Email-stage leads that Send All can queue without a missing To address. */
export async function countEmailStageWithUsableInbox(
  ctx: Pick<TenantContext, "tenantId" | "userId" | "role" | "platformRole">,
): Promise<number> {
  const where = withLeadVisibility(
    ctx,
    eq(leads.tenantId, ctx.tenantId),
    inArray(leads.status, EMAIL_STAGE_STATUSES),
    withoutPendingInitialEmailSend(),
    withLikelySendableContactEmail(),
  );
  const row = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(leads)
    .innerJoin(contacts, eq(contacts.id, leads.contactId))
    .where(where);
  return row[0]?.n ?? 0;
}

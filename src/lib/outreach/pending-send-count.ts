import { and, eq, inArray, notExists, sql, type SQL } from "drizzle-orm";
import { db, leads, outreachSchedule } from "@/db";
import { withLeadVisibility } from "@/lib/leads/lead-visibility";
import { STATUSES_BY_STAGE_INDEX } from "@/lib/pipeline-status";
import type { TenantContext } from "@/lib/tenant";

const EMAIL_STAGE_STATUSES = STATUSES_BY_STAGE_INDEX[1] ?? ["draft_ready", "approved"];

/** SQL filter: lead has no Email 1 row scheduled or sending. */
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
          inArray(outreachSchedule.status, ["scheduled", "sending"]),
        ),
      ),
  );
}

export async function countPendingInitialEmailSends(
  ctx: Pick<TenantContext, "tenantId" | "userId" | "role" | "platformRole">,
): Promise<number> {
  const where = withLeadVisibility(
    ctx,
    eq(leads.tenantId, ctx.tenantId),
    inArray(leads.status, EMAIL_STAGE_STATUSES),
    inArray(outreachSchedule.status, ["scheduled", "sending"]),
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

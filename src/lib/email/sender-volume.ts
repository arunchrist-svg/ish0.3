import { db, outreachSchedule, leads } from "@/db";
import { and, eq, gte, sql } from "drizzle-orm";
import { extractDomain } from "@/lib/email/sender-domain";

/**
 * Count live workspace sends in the last 24h.
 * `fromAddress` is accepted for future per-domain filtering; schedule rows do not
 * yet store the from-domain, so counts are workspace-scoped today.
 */
export async function countSendsLast24h(workspaceId: string, fromAddress: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  // Reserved for when outreach_schedule stores fromDomain
  void extractDomain(fromAddress);

  const rows = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(outreachSchedule)
    .innerJoin(leads, eq(outreachSchedule.leadId, leads.id))
    .where(
      and(
        eq(leads.workspaceId, workspaceId),
        eq(outreachSchedule.status, "sent"),
        gte(outreachSchedule.sentAt, since),
      ),
    );

  return rows[0]?.total ?? 0;
}

export function assertVolumeWithinCap(params: {
  sendsLast24h: number;
  dailyCap: number;
  projectedAdditional?: number;
}): { ok: boolean; projectedTotal: number; overBy: number } {
  const projected = Math.max(0, params.projectedAdditional ?? 0);
  const projectedTotal = params.sendsLast24h + projected;
  const overBy = Math.max(0, projectedTotal - params.dailyCap);
  return {
    ok: projectedTotal <= params.dailyCap,
    projectedTotal,
    overBy,
  };
}

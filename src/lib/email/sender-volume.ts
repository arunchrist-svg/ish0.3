import { db, outreachSchedule, leads } from "@/db";
import { and, eq, gte, sql } from "drizzle-orm";

function extractDomain(email: string): string {
  return email.trim().toLowerCase().split("@").pop() ?? email;
}

export async function countSendsLast24h(workspaceId: string, fromAddress: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const domain = extractDomain(fromAddress);

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

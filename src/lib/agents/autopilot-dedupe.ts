import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { db, accounts, leads, outreachSchedule } from "@/db";
import { companyDedupeReason } from "@/lib/agents/autopilot-logic";

export type AutopilotCompanyBlock = {
  reason: string | null;
};

const ACTIVE_SEQUENCE = new Set(["scheduled", "sending", "pending_review", "paused"]);

export async function loadAutopilotCompanyBlocks(params: {
  tenantId: string;
  workspaceId: string;
  alreadyOnThisRun: string[];
}): Promise<Map<string, string>> {
  const blocked = new Map<string, string>();
  for (const name of params.alreadyOnThisRun) {
    const key = name.trim().toLowerCase();
    if (key) blocked.set(key, "already on this Autopilot run");
  }

  const accountRows = await db
    .select({
      id: accounts.id,
      name: accounts.name,
    })
    .from(accounts)
    .where(and(eq(accounts.tenantId, params.tenantId), eq(accounts.workspaceId, params.workspaceId)))
    .limit(2000);

  if (!accountRows.length) return blocked;

  const accountIds = accountRows.map((row) => row.id);
  const boardLeadRows = await db
    .selectDistinct({ accountId: leads.accountId })
    .from(leads)
    .where(and(eq(leads.tenantId, params.tenantId), inArray(leads.accountId, accountIds)));
  const boardLeadIds = new Set(boardLeadRows.map((row) => row.accountId));

  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const emailedRows = await db
    .selectDistinct({ accountId: leads.accountId })
    .from(outreachSchedule)
    .innerJoin(leads, eq(leads.id, outreachSchedule.leadId))
    .where(
      and(
        eq(leads.tenantId, params.tenantId),
        inArray(leads.accountId, accountIds),
        gte(sql`coalesce(${outreachSchedule.sentAt}, ${outreachSchedule.scheduledFor})`, monthAgo),
      ),
    );
  const emailedIds = new Set(emailedRows.map((row) => row.accountId));

  const sequenceRows = await db
    .selectDistinct({ accountId: leads.accountId, status: outreachSchedule.status })
    .from(outreachSchedule)
    .innerJoin(leads, eq(leads.id, outreachSchedule.leadId))
    .where(and(eq(leads.tenantId, params.tenantId), inArray(leads.accountId, accountIds)));
  const activeIds = new Set(
    sequenceRows.filter((row) => ACTIVE_SEQUENCE.has(row.status)).map((row) => row.accountId),
  );

  for (const account of accountRows) {
    const key = account.name.trim().toLowerCase();
    if (!key || blocked.has(key)) continue;
    const reason = companyDedupeReason({
      hasBoardLead: boardLeadIds.has(account.id),
      emailedThisMonth: emailedIds.has(account.id),
      hasActiveSequence: activeIds.has(account.id),
    });
    if (reason) blocked.set(key, reason);
  }

  return blocked;
}

export function blockReasonForCompany(name: string, blocked: Map<string, string>): string | null {
  return blocked.get(name.trim().toLowerCase()) ?? null;
}

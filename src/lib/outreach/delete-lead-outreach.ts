import {
  db,
  leadOutreach,
  outreachApprovals,
  outreachEditMessages,
  outreachSchedule,
} from "@/db";
import { inArray, type SQL } from "drizzle-orm";

/**
 * Deletes lead_outreach rows matching `where`, including dependent rows that
 * would otherwise violate FK constraints (edit messages, approvals, schedule links).
 */
export async function deleteLeadOutreachWhere(where: SQL | undefined): Promise<void> {
  if (!where) return;
  const rows = await db.select({ id: leadOutreach.id }).from(leadOutreach).where(where);
  const ids = rows.map((row) => row.id);
  if (ids.length === 0) return;

  await db.delete(outreachEditMessages).where(inArray(outreachEditMessages.leadOutreachId, ids));

  await db
    .update(outreachSchedule)
    .set({ draftLeadOutreachId: null })
    .where(inArray(outreachSchedule.draftLeadOutreachId, ids));

  const approvals = await db
    .select({ id: outreachApprovals.id })
    .from(outreachApprovals)
    .where(inArray(outreachApprovals.leadOutreachId, ids));
  const approvalIds = approvals.map((row) => row.id);

  if (approvalIds.length > 0) {
    await db
      .update(outreachSchedule)
      .set({ approvalId: null })
      .where(inArray(outreachSchedule.approvalId, approvalIds));
    await db.delete(outreachApprovals).where(inArray(outreachApprovals.id, approvalIds));
  }

  await db.delete(leadOutreach).where(inArray(leadOutreach.id, ids));
}

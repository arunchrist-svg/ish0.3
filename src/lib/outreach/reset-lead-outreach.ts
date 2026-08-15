import { db, leads, leadOutreach, outreachApprovals, outreachSchedule } from "@/db";
import { eq } from "drizzle-orm";
import { deleteLeadOutreachWhere } from "@/lib/outreach/delete-lead-outreach";

/**
 * Wipe outreach for a lead so Write Email 1 can start fresh.
 * Clears schedule, approvals, drafts, and reply/thread fields; status → researched.
 */
export async function resetLeadOutreach(leadId: string): Promise<void> {
  await db.delete(outreachSchedule).where(eq(outreachSchedule.leadId, leadId));
  await db.delete(outreachApprovals).where(eq(outreachApprovals.leadId, leadId));
  await deleteLeadOutreachWhere(eq(leadOutreach.leadId, leadId));

  await db
    .update(leads)
    .set({
      status: "researched",
      lastReplyContent: null,
      lastInboundMessageId: null,
      threadRootMessageId: null,
      threadRootSubject: null,
      updatedAt: new Date(),
    })
    .where(eq(leads.id, leadId));
}

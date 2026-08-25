import { and, eq, not, or, type SQL } from "drizzle-orm";
import { db, leads, leadOutreach, outreachApprovals, outreachSchedule } from "@/db";
import { deleteLeadOutreachWhere } from "@/lib/outreach/delete-lead-outreach";

function isInboundReplyRow(): SQL {
  return or(eq(outreachSchedule.emailKind, "inbound_reply"), eq(outreachSchedule.sequenceDay, -2))!;
}

/**
 * Wipe outbound outreach for a lead so Write Email 1 can start fresh.
 * Keeps inbound reply evidence so a captured reply is not lost when the sequence is reset.
 */
export async function resetLeadOutreach(leadId: string): Promise<void> {
  const [lead] = await db
    .select({
      status: leads.status,
      lastReplyContent: leads.lastReplyContent,
      lastInboundMessageId: leads.lastInboundMessageId,
    })
    .from(leads)
    .where(eq(leads.id, leadId))
    .limit(1);

  const inboundRows = await db
    .select({ id: outreachSchedule.id })
    .from(outreachSchedule)
    .where(and(eq(outreachSchedule.leadId, leadId), isInboundReplyRow()));

  await db
    .delete(outreachSchedule)
    .where(and(eq(outreachSchedule.leadId, leadId), not(isInboundReplyRow())));

  await db.delete(outreachApprovals).where(eq(outreachApprovals.leadId, leadId));
  await deleteLeadOutreachWhere(eq(leadOutreach.leadId, leadId));

  const hadReply =
    lead?.status === "replied" ||
    Boolean(lead?.lastReplyContent?.trim()) ||
    Boolean(lead?.lastInboundMessageId?.trim()) ||
    inboundRows.length > 0;

  await db
    .update(leads)
    .set({
      status: hadReply ? "replied" : "researched",
      lastReplyContent: hadReply ? (lead?.lastReplyContent ?? null) : null,
      lastInboundMessageId: hadReply ? (lead?.lastInboundMessageId ?? null) : null,
      threadRootMessageId: null,
      threadRootSubject: null,
      updatedAt: new Date(),
    })
    .where(eq(leads.id, leadId));
}

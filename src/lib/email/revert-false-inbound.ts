import { db, leads, outreachSchedule } from "@/db";
import { and, eq, gt, inArray, isNull, or } from "drizzle-orm";
import { INBOUND_REPLY_EMAIL_KIND } from "@/lib/email/inbound-match";

export type RevertFalseInboundResult = {
  leadId: string;
  deletedInbound: number;
  restoredFollowUps: number;
  statusReset: boolean;
};

export async function revertFalseInboundReply(leadId: string): Promise<RevertFalseInboundResult> {
  const inbound = await db
    .select({ id: outreachSchedule.id })
    .from(outreachSchedule)
    .where(
      and(
        eq(outreachSchedule.leadId, leadId),
        eq(outreachSchedule.channel, "email"),
        or(eq(outreachSchedule.emailKind, INBOUND_REPLY_EMAIL_KIND), eq(outreachSchedule.sequenceDay, -2)),
      ),
    );

  if (inbound.length > 0) {
    await db.delete(outreachSchedule).where(
      inArray(
        outreachSchedule.id,
        inbound.map((row) => row.id),
      ),
    );
  }

  const restored = await db
    .update(outreachSchedule)
    .set({ status: "scheduled", lastError: null })
    .where(
      and(
        eq(outreachSchedule.leadId, leadId),
        eq(outreachSchedule.channel, "email"),
        eq(outreachSchedule.status, "cancelled"),
        gt(outreachSchedule.sequenceDay, 0),
        isNull(outreachSchedule.lastError),
      ),
    )
    .returning({ id: outreachSchedule.id });

  const lead = await db.query.leads.findFirst({ where: eq(leads.id, leadId) });
  let statusReset = false;
  if (lead?.status === "replied") {
    await db
      .update(leads)
      .set({
        status: "outreached",
        lastReplyContent: null,
        lastInboundMessageId: null,
        updatedAt: new Date(),
      })
      .where(eq(leads.id, leadId));
    statusReset = true;
  } else {
    await db
      .update(leads)
      .set({
        lastReplyContent: null,
        lastInboundMessageId: null,
        updatedAt: new Date(),
      })
      .where(eq(leads.id, leadId));
  }

  return {
    leadId,
    deletedInbound: inbound.length,
    restoredFollowUps: restored.length,
    statusReset,
  };
}

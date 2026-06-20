import { db, outreachSchedule, leads, contacts, leadOutreach, outreachApprovals, yieldFunnel } from "@/db";
import { eq, lte, and } from "drizzle-orm";
import { sendEmail } from "@/lib/email/resend-client";
import { buildEmailHtml } from "@/lib/email/templates";
import { logAudit } from "@/lib/audit";

const FOLLOW_UP_TEMPLATES: Record<number, (contact: string, company: string) => string> = {
  4: (contact, company) =>
    `Dear ${contact},\n\nFollowing up on my earlier note — just wanted to check if you had a chance to think about corporate gifting for ${company}'s team this Diwali.\n\nHappy to send over a quick sample or price list. Can we connect for 10 minutes this week?\n\nWarm regards,\nISH Gifting Team`,
  8: (contact, company) =>
    `Dear ${contact},\n\nDiwali is getting closer and slots are filling up. If you're still considering gift options for the ${company} team, we'd love to help you lock in an order.\n\nA quick call or just a reply here works — what would you prefer?\n\nWarm regards,\nISH Gifting Team`,
  14: (contact, company) =>
    `Dear ${contact},\n\nThis is my last note — I don't want to take up your inbox if this isn't the right time.\n\nIf things change and you'd like to explore gifting for your team, we're here. Wishing you and the ${company} team a wonderful Diwali!\n\nWarmly,\nISH Gifting Team`,
};

export async function runSequencer(): Promise<{ processed: number; failed: number }> {
  const now = new Date();
  const due = await db
    .select()
    .from(outreachSchedule)
    .where(and(lte(outreachSchedule.scheduledFor, now), eq(outreachSchedule.status, "scheduled")))
    .limit(50);

  let processed = 0;
  let failed = 0;

  for (const sched of due) {
    try {
      const lead = await db.query.leads.findFirst({
        where: eq(leads.id, sched.leadId),
        with: { contact: true },
      });
      if (!lead) continue;

      const contact = lead.contact as typeof contacts.$inferSelect;
      const firstName = contact.firstName ?? contact.name.split(" ")[0];
      const company = (lead as { account?: { name: string } }).account?.name ?? "your company";

      const bodyFn = FOLLOW_UP_TEMPLATES[sched.sequenceDay];
      const body = bodyFn ? bodyFn(firstName, company) : FOLLOW_UP_TEMPLATES[14](firstName, company);

      const subject = `Re: Diwali gifting for ${company} — Day ${sched.sequenceDay} follow-up`;

      const result = await sendEmail({
        to: contact.email ?? "",
        subject,
        html: buildEmailHtml({ body }),
        replyTo: process.env.EMAIL_REPLY_TO_ADDRESS,
      });

      await db
        .update(outreachSchedule)
        .set({ status: "sent", sentAt: new Date(), resendId: result.messageId })
        .where(eq(outreachSchedule.id, sched.id));

      await logAudit({
        action: "sequencer.sent",
        entityType: "lead",
        entityId: sched.leadId,
        metadata: { day: sched.sequenceDay, mode: result.mode, messageId: result.messageId },
      });

      processed++;
    } catch (e) {
      console.error("[sequencer] failed for schedule", sched.id, e);
      failed++;
    }
  }

  return { processed, failed };
}

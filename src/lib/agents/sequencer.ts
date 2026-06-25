import { db, outreachSchedule, leads, contacts, accounts, leadOutreach } from "@/db";
import { eq, lte, and } from "drizzle-orm";
import { sendEmail } from "@/lib/email/email-sender";
import { buildEmailHtml } from "@/lib/email/templates";
import { logAudit } from "@/lib/audit";
import { getResolvedEmailConfig } from "@/lib/settings/email-settings";
import { runWriter } from "@/lib/agents/writer";
import { assertCredits, deductCredits, InsufficientCreditsError } from "@/lib/billing/credits";
import { assertPlanEntitlement } from "@/lib/billing/entitlements";

export async function runSequencer(): Promise<{ processed: number; failed: number; skipped: number }> {
  const now = new Date();
  const due = await db
    .select()
    .from(outreachSchedule)
    .where(and(lte(outreachSchedule.scheduledFor, now), eq(outreachSchedule.status, "scheduled")))
    .limit(50);

  let processed = 0;
  let failed = 0;
  let skipped = 0;

  for (const sched of due) {
    try {
      const lead = await db.query.leads.findFirst({
        where: eq(leads.id, sched.leadId),
        with: { contact: true, account: true },
      });

      if (!lead) {
        await db.update(outreachSchedule).set({ status: "cancelled" }).where(eq(outreachSchedule.id, sched.id));
        skipped++;
        continue;
      }

      // Only send follow-ups to leads still in outreached stage
      if (lead.status !== "outreached") {
        await db.update(outreachSchedule).set({ status: "cancelled" }).where(eq(outreachSchedule.id, sched.id));
        skipped++;
        continue;
      }

      const contact = lead.contact as typeof contacts.$inferSelect;
      const account = lead.account as typeof accounts.$inferSelect;

      // Load original email body for context
      const originalOutreach = await db.query.leadOutreach.findFirst({
        where: eq(leadOutreach.leadId, sched.leadId),
      });

      const followUpMode = sched.sequenceDay <= 3 ? "follow_up" : "final_reminder";

      const emailConfig = await getResolvedEmailConfig(lead.workspaceId);
      if (emailConfig.sendMode === "live") {
        await assertPlanEntitlement(lead.tenantId, "live_send");
        await assertCredits(lead.tenantId, "writer.draft", 1);
        await assertCredits(lead.tenantId, "email.live", 1);
      } else {
        await assertCredits(lead.tenantId, "writer.draft", 1);
      }

      // Use Writer agent to generate a personalized follow-up
      const outreachId = await runWriter(sched.leadId, {
        followUpMode,
        originalEmailBody: originalOutreach?.emailBody ?? undefined,
      });

      const generatedOutreach = await db.query.leadOutreach.findFirst({
        where: eq(leadOutreach.id, outreachId),
      });

      if (!generatedOutreach) throw new Error("Writer returned no outreach");

      const subject = generatedOutreach.subjectA ?? `Re: Diwali gifting — ${account.name}`;
      const body = generatedOutreach.emailBody ?? "";

      const result = await sendEmail({
        workspaceId: lead.workspaceId,
        to: contact.email ?? "",
        subject,
        html: buildEmailHtml({
          body,
          trackingToken: sched.trackingToken ?? undefined,
          appUrl: emailConfig.appUrl,
        }),
        replyTo: emailConfig.replyToAddress,
      });

      await db
        .update(outreachSchedule)
        .set({ status: "sent", sentAt: new Date(), resendId: result.messageId }) // provider message id
        .where(eq(outreachSchedule.id, sched.id));

      await deductCredits({
        tenantId: lead.tenantId,
        action: "writer.draft",
        referenceId: outreachId,
        idempotencyKey: `sequencer-writer-${sched.id}`,
      });
      if (emailConfig.sendMode === "live") {
        await deductCredits({
          tenantId: lead.tenantId,
          action: "email.live",
          referenceId: sched.leadId,
          idempotencyKey: `sequencer-send-${sched.id}`,
        });
      }

      await logAudit({
        tenantId: lead.tenantId,
        workspaceId: lead.workspaceId,
        action: "sequencer.sent",
        entityType: "lead",
        entityId: sched.leadId,
        metadata: {
          day: sched.sequenceDay,
          mode: result.mode,
          messageId: result.messageId,
          outreachId,
          followUpMode,
        },
      });

      processed++;
    } catch (e) {
      if (e instanceof InsufficientCreditsError) {
        skipped++;
        continue;
      }
      console.error("[sequencer] failed for schedule", sched.id, e);
      failed++;
    }
  }

  return { processed, failed, skipped };
}

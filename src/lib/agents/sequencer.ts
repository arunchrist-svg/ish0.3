import { db, outreachSchedule, leads, contacts, accounts, leadOutreach, leadResearch } from "@/db";
import { eq, lte, and } from "drizzle-orm";
import { notifyLeadEvent } from "@/lib/push/notify-workspace";
import { logAudit } from "@/lib/audit";
import { getResolvedEmailConfig } from "@/lib/settings/email-settings";
import { assertSenderPreflight, SenderPreflightError } from "@/lib/email/sender-preflight";
import { runWriter } from "@/lib/agents/writer";
import { assertCredits, deductCredits, InsufficientCreditsError } from "@/lib/billing/credits";
import { assertPlanEntitlement } from "@/lib/billing/entitlements";
import { isOutreachSendingPaused } from "@/lib/email/config";
import { evaluateOutreachDraft } from "@/lib/agents/quality-gate";
import { sendScheduledFollowUp, FollowUpQualityError } from "@/lib/outreach/send-scheduled-followup";

export async function runSequencer(): Promise<{
  processed: number;
  failed: number;
  skipped: number;
  pendingReview: number;
}> {
  const now = new Date();
  const due = await db
    .select()
    .from(outreachSchedule)
    .where(and(lte(outreachSchedule.scheduledFor, now), eq(outreachSchedule.status, "scheduled")))
    .limit(50);

  let processed = 0;
  let failed = 0;
  let skipped = 0;
  let pendingReview = 0;

  for (const sched of due) {
    try {
      if (sched.sequenceDay <= 0) {
        skipped++;
        continue;
      }

      const lead = await db.query.leads.findFirst({
        where: eq(leads.id, sched.leadId),
        with: { contact: true, account: true, research: true },
      });

      if (!lead) {
        await db.update(outreachSchedule).set({ status: "cancelled" }).where(eq(outreachSchedule.id, sched.id));
        skipped++;
        continue;
      }

      if (lead.status !== "outreached") {
        await db.update(outreachSchedule).set({ status: "cancelled" }).where(eq(outreachSchedule.id, sched.id));
        skipped++;
        continue;
      }

      const contact = lead.contact as typeof contacts.$inferSelect;
      const account = lead.account as typeof accounts.$inferSelect;
      const research = lead.research as typeof leadResearch.$inferSelect | null;

      const emailConfig = await getResolvedEmailConfig(lead.workspaceId);
      if (isOutreachSendingPaused(emailConfig)) {
        skipped++;
        continue;
      }
      if (emailConfig.sendMode === "live") {
        await assertPlanEntitlement(lead.tenantId, "live_send");
        await assertCredits(lead.tenantId, "email.live", 1);
      }

      let generatedOutreach = sched.draftLeadOutreachId
        ? await db.query.leadOutreach.findFirst({ where: eq(leadOutreach.id, sched.draftLeadOutreachId) })
        : null;

      let outreachId = sched.draftLeadOutreachId ?? "";
      const followUpMode = sched.sequenceDay <= 3 ? "follow_up" : "final_reminder";

      if (!generatedOutreach) {
        await assertCredits(lead.tenantId, "writer.draft", 1);
        const originalOutreach = await db.query.leadOutreach.findFirst({
          where: eq(leadOutreach.leadId, sched.leadId),
        });
        outreachId = await runWriter(sched.leadId, {
          followUpMode,
          originalEmailBody: originalOutreach?.emailBody ?? undefined,
        });
        generatedOutreach = await db.query.leadOutreach.findFirst({
          where: eq(leadOutreach.id, outreachId),
        });
      }

      if (!generatedOutreach) throw new Error("No outreach draft for follow-up");

      const subject = generatedOutreach.subjectA ?? `Re: Diwali gifting for ${account.name}`;
      const body = generatedOutreach.emailBody ?? "";

      const quality = await evaluateOutreachDraft({
        subject,
        emailBody: body,
        contact: { name: contact.name, firstName: contact.firstName, title: contact.title },
        account,
        giftingHook: research?.giftingHook,
        sequencePosition: generatedOutreach.sequencePosition ?? 2,
      });

      const requiresReview = emailConfig.followUpPolicy === "review_all_followups";
      const failsQuality = !quality.passes || Boolean(generatedOutreach.revisionTimeout);

      if (requiresReview || failsQuality) {
        await db
          .update(outreachSchedule)
          .set({
            status: "pending_review",
            draftLeadOutreachId: generatedOutreach.id,
          })
          .where(eq(outreachSchedule.id, sched.id));

        await logAudit({
          tenantId: lead.tenantId,
          workspaceId: lead.workspaceId,
          action: "sequencer.pending_review",
          entityType: "lead",
          entityId: sched.leadId,
          metadata: {
            scheduleId: sched.id,
            day: sched.sequenceDay,
            outreachId: generatedOutreach.id,
            delivScore: quality.delivScore,
            rubricTotal: quality.rubricTotal,
            requiresReview,
            revisionTimeout: generatedOutreach.revisionTimeout,
          },
        });

        void notifyLeadEvent(sched.leadId, "followup.pending_review");
        pendingReview++;
        continue;
      }

      try {
        await assertSenderPreflight(emailConfig, lead.workspaceId);
      } catch (e) {
        if (e instanceof SenderPreflightError) {
          console.warn("[sequencer] sender preflight failed, skipping send", e.issues);
          skipped++;
          continue;
        }
        throw e;
      }

      if (!sched.draftLeadOutreachId) {
        await db
          .update(outreachSchedule)
          .set({ draftLeadOutreachId: generatedOutreach.id })
          .where(eq(outreachSchedule.id, sched.id));
      }

      if (!sched.draftLeadOutreachId) {
        await deductCredits({
          tenantId: lead.tenantId,
          action: "writer.draft",
          referenceId: outreachId,
          idempotencyKey: `sequencer-writer-${sched.id}`,
        });
      }

            await sendScheduledFollowUp({
        scheduleId: sched.id,
        tenantId: lead.tenantId,
        workspaceId: lead.workspaceId,
      });

      processed++;
    } catch (e) {
      if (e instanceof InsufficientCreditsError) {
        skipped++;
        continue;
      }
      if (e instanceof FollowUpQualityError) {
        await db
          .update(outreachSchedule)
          .set({ status: "pending_review" })
          .where(eq(outreachSchedule.id, sched.id));
        pendingReview++;
        continue;
      }
      console.error("[sequencer] failed for schedule", sched.id, e);
      failed++;
    }
  }

  return { processed, failed, skipped, pendingReview };
}

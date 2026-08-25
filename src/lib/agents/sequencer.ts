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
import { isWithinSendWindow, nextSendWindowStart } from "@/lib/email/send-window";
import { companyNameForEmail } from "@/lib/email/company-display-name";
import { evaluateOutreachDraft } from "@/lib/agents/quality-gate";
import { sendScheduledFollowUp, FollowUpQualityError } from "@/lib/outreach/send-scheduled-followup";
import { isCatalogOnOpenDraft, isIshFestiveCatalogBody, CATALOG_ON_OPEN_EMAIL_KIND } from "@/lib/email/ish-festive-catalog";

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

      const emailConfig = await getResolvedEmailConfig(lead.workspaceId, lead.createdByUserId || undefined);
      if (isOutreachSendingPaused(emailConfig)) {
        skipped++;
        continue;
      }

      const sendWindow = {
        daysOfWeek: emailConfig.sendDaysOfWeek,
        hourStart: emailConfig.sendHourStart,
        hourEnd: emailConfig.sendHourEnd,
        timezone: emailConfig.sendTimezone,
      };
      if (!isWithinSendWindow(now, sendWindow)) {
        const nextSlot = nextSendWindowStart(now, sendWindow);
        if (nextSlot.getTime() > now.getTime()) {
          await db
            .update(outreachSchedule)
            .set({ scheduledFor: nextSlot })
            .where(eq(outreachSchedule.id, sched.id));
        }
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
        if (sched.emailKind === CATALOG_ON_OPEN_EMAIL_KIND) {
          skipped++;
          continue;
        }
        await assertCredits(lead.tenantId, "writer.draft", 1);
        const originalOutreach = await db.query.leadOutreach.findFirst({
          where: eq(leadOutreach.leadId, sched.leadId),
        });
        outreachId = await runWriter(sched.leadId, {
          followUpMode,
          originalEmailBody: originalOutreach?.emailBody ?? undefined,
          originalEmailSubject: originalOutreach?.subjectA ?? undefined,
        });
        generatedOutreach = await db.query.leadOutreach.findFirst({
          where: eq(leadOutreach.id, outreachId),
        });
      }

      if (!generatedOutreach) throw new Error("No outreach draft for follow-up");

      const subject =
        generatedOutreach.subjectA ?? `Re: Outreach for ${companyNameForEmail(account.name)}`;
      const body = generatedOutreach.emailBody ?? "";
      const isCatalog =
        isCatalogOnOpenDraft(generatedOutreach) || isIshFestiveCatalogBody(body);

      const quality = await evaluateOutreachDraft({
        subject,
        emailBody: body,
        contact: { name: contact.name, firstName: contact.firstName, title: contact.title },
        account: {
          name: companyNameForEmail(account.name),
          industry: account.industry,
          city: account.city,
          employees: account.employees,
          intelNotes: account.intelNotes,
        },
        outreachHook: research?.outreachHook,
        sequencePosition: generatedOutreach.sequencePosition ?? 2,
      });

      const requiresReview = !isCatalog && emailConfig.followUpPolicy === "review_all_followups";
      const failsQuality = !isCatalog && (!quality.passes || Boolean(generatedOutreach.revisionTimeout));

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
        await assertSenderPreflight(emailConfig, lead.workspaceId, {
          projectedAdditional: 1,
        });
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

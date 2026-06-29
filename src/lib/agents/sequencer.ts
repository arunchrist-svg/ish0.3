import { db, outreachSchedule, leads, contacts, accounts, leadOutreach } from "@/db";
import { eq, lte, and } from "drizzle-orm";
import { sendEmail } from "@/lib/email/email-sender";
import { buildEmailHtml } from "@/lib/email/templates";
import { logAudit } from "@/lib/audit";
import { getResolvedEmailConfig } from "@/lib/settings/email-settings";
import { assertSenderPreflight, SenderPreflightError } from "@/lib/email/sender-preflight";
import { runWriter } from "@/lib/agents/writer";
import { assertCredits, deductCredits, InsufficientCreditsError } from "@/lib/billing/credits";
import { assertPlanEntitlement } from "@/lib/billing/entitlements";
import { generateRfcMessageId } from "@/lib/email/threading";
import { loadThreadContext, resolveOutboundSubject, resolveThreadHeaders } from "@/lib/email/thread-context";
import { isOutreachSendingPaused } from "@/lib/email/config";

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
      if (sched.sequenceDay <= 0) {
        skipped++;
        continue;
      }

      const lead = await db.query.leads.findFirst({
        where: eq(leads.id, sched.leadId),
        with: { contact: true, account: true },
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

      const thread = await loadThreadContext(sched.leadId, lead);
      const threadedSubject = thread.rootSubject
        ? resolveOutboundSubject({ isReplySend: true, rootSubject: thread.rootSubject, fallbackSubject: thread.rootSubject })
        : (generatedOutreach.subjectA ?? `Re: Diwali gifting for ${account.name}`);
      const body = generatedOutreach.emailBody ?? "";

      const threadHeaders = resolveThreadHeaders({
        isReplySend: false,
        isFollowUp: true,
        rootMessageId: thread.rootMessageId,
        inboundMessageId: null,
        referencesChain: thread.referencesChain,
      });

      try {
        await assertSenderPreflight(emailConfig, lead.workspaceId);
      } catch (e) {
        if (e instanceof SenderPreflightError) {
          console.warn("[sequencer] sender preflight failed, skipping send", e.issues);
          continue;
        }
        throw e;
      }

      const fromAddress = emailConfig.fromAddress ?? emailConfig.smtpUser ?? "noreply@ish.local";
      const rfcMessageId = generateRfcMessageId(fromAddress);

      const result = await sendEmail({
        workspaceId: lead.workspaceId,
        to: contact.email ?? "",
        subject: threadedSubject,
        html: buildEmailHtml({
          body,
          trackingToken: sched.trackingToken ?? undefined,
          appUrl: emailConfig.appUrl,
          emailStyle: emailConfig.emailStyle,
        }),
        replyTo: emailConfig.replyToAddress,
        messageId: rfcMessageId,
        inReplyTo: threadHeaders.inReplyTo,
        references: threadHeaders.references,
      });

      await db
        .update(outreachSchedule)
        .set({
          status: "sent",
          sentAt: new Date(),
          resendId: result.messageId,
          rfcMessageId,
          inReplyTo: threadHeaders.inReplyTo ?? null,
          referencesChain: threadHeaders.references ?? null,
          subjectSent: threadedSubject,
          bodySnippet: body.slice(0, 500) || null,
          emailKind: "followup",
        })
        .where(eq(outreachSchedule.id, sched.id));

      if (!sched.draftLeadOutreachId) {
        await deductCredits({
          tenantId: lead.tenantId,
          action: "writer.draft",
          referenceId: outreachId,
          idempotencyKey: `sequencer-writer-${sched.id}`,
        });
      }
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
          messageId: rfcMessageId,
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

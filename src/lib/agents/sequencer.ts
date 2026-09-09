import { db, outreachSchedule, leads, contacts, accounts, leadOutreach, leadResearch } from "@/db";
import { eq, lte, and, or, asc, isNull, notInArray } from "drizzle-orm";
import { notifyLeadEvent } from "@/lib/push/notify-workspace";
import { logAudit } from "@/lib/audit";
import { getResolvedEmailConfig } from "@/lib/settings/email-settings";
import { assertSenderPreflight, SenderPreflightError } from "@/lib/email/sender-preflight";
import { runWriter } from "@/lib/agents/writer";
import { assertCredits, deductCredits, InsufficientCreditsError } from "@/lib/billing/credits";
import { assertPlanEntitlement } from "@/lib/billing/entitlements";
import { isOutreachSendingPaused } from "@/lib/email/config";
import { isWithinSendWindow, nextSendWindowStart, sendWindowFromEmailFields } from "@/lib/email/send-window";
import { companyNameForEmail } from "@/lib/email/company-display-name";
import { evaluateOutreachDraft } from "@/lib/agents/quality-gate";
import { sendScheduledFollowUp, FollowUpQualityError } from "@/lib/outreach/send-scheduled-followup";
import { sendScheduledInitialEmail } from "@/lib/outreach/send-scheduled-initial";
import { isCatalogOnOpenDraft, isIshFestiveCatalogBody, CATALOG_ON_OPEN_EMAIL_KIND } from "@/lib/email/ish-festive-catalog";

const BATCH_SIZE = 50;
const MAX_BATCHES = 20;
const MAX_ATTEMPTS = 5;
const STALE_SENDING_MS = 15 * 60 * 1000;

type ScheduleRow = typeof outreachSchedule.$inferSelect;

function errorMessage(e: unknown): string {
  if (e instanceof Error && e.message.trim()) return e.message.trim().slice(0, 500);
  return "Unknown sequencer error";
}

async function claimSchedule(id: string, now: Date, staleBefore: Date): Promise<ScheduleRow | null> {
  const [claimed] = await db
    .update(outreachSchedule)
    .set({
      status: "sending",
      lastAttemptAt: now,
      lastError: null,
    })
    .where(
      and(
        eq(outreachSchedule.id, id),
        or(
          eq(outreachSchedule.status, "scheduled"),
          and(
            eq(outreachSchedule.status, "sending"),
            or(isNull(outreachSchedule.lastAttemptAt), lte(outreachSchedule.lastAttemptAt, staleBefore)),
          ),
        ),
      ),
    )
    .returning();
  return claimed ?? null;
}

async function releaseToScheduled(
  id: string,
  reason: string,
  patch?: { scheduledFor?: Date },
): Promise<void> {
  await db
    .update(outreachSchedule)
    .set({
      status: "scheduled",
      lastError: reason,
      ...(patch?.scheduledFor ? { scheduledFor: patch.scheduledFor } : {}),
    })
    .where(eq(outreachSchedule.id, id));
}

async function markFailedOrRetry(id: string, attemptCount: number, reason: string): Promise<"failed" | "retry"> {
  const nextAttempts = attemptCount + 1;
  if (nextAttempts >= MAX_ATTEMPTS) {
    await db
      .update(outreachSchedule)
      .set({ status: "failed", attemptCount: nextAttempts, lastError: reason })
      .where(eq(outreachSchedule.id, id));
    return "failed";
  }
  await db
    .update(outreachSchedule)
    .set({ status: "scheduled", attemptCount: nextAttempts, lastError: reason })
    .where(eq(outreachSchedule.id, id));
  return "retry";
}

async function cancelWithReason(id: string, reason: string): Promise<void> {
  await db
    .update(outreachSchedule)
    .set({ status: "cancelled", lastError: reason })
    .where(eq(outreachSchedule.id, id));
}

export async function runSequencer(): Promise<{
  processed: number;
  failed: number;
  skipped: number;
  pendingReview: number;
}> {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - STALE_SENDING_MS);

  let processed = 0;
  let failed = 0;
  let skipped = 0;
  let pendingReview = 0;
  const seenIds = new Set<string>();

  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    const dueConditions = [
      lte(outreachSchedule.scheduledFor, now),
      or(
        eq(outreachSchedule.status, "scheduled"),
        and(
          eq(outreachSchedule.status, "sending"),
          or(isNull(outreachSchedule.lastAttemptAt), lte(outreachSchedule.lastAttemptAt, staleBefore)),
        ),
      ),
    ];
    if (seenIds.size > 0) {
      dueConditions.push(notInArray(outreachSchedule.id, [...seenIds]));
    }

    const due = await db
      .select()
      .from(outreachSchedule)
      .where(and(...dueConditions))
      .orderBy(asc(outreachSchedule.scheduledFor))
      .limit(BATCH_SIZE);

    if (!due.length) break;

    for (const sched of due) {
      seenIds.add(sched.id);
      const claimed = await claimSchedule(sched.id, now, staleBefore);
      if (!claimed) {
        skipped++;
        continue;
      }

      try {
        const lead = await db.query.leads.findFirst({
          where: eq(leads.id, claimed.leadId),
          with: { contact: true, account: true, research: true },
        });

        if (!lead) {
          await cancelWithReason(claimed.id, "Lead not found");
          skipped++;
          continue;
        }

        const emailConfig = await getResolvedEmailConfig(lead.workspaceId, lead.createdByUserId || undefined);
        if (isOutreachSendingPaused(emailConfig)) {
          await releaseToScheduled(claimed.id, "Outbox sending is paused");
          skipped++;
          continue;
        }

        const sendWindow = sendWindowFromEmailFields(emailConfig);
        if (!isWithinSendWindow(now, sendWindow)) {
          const nextSlot = nextSendWindowStart(now, sendWindow);
          const patch =
            nextSlot.getTime() > now.getTime() ? { scheduledFor: nextSlot } : undefined;
          await releaseToScheduled(claimed.id, "Outside send window", patch);
          skipped++;
          continue;
        }

        // Queued Email 1 (deferred outside the settings send window).
        if (claimed.sequenceDay === 0) {
          if (lead.status !== "draft_ready" && lead.status !== "outreached") {
            await cancelWithReason(claimed.id, `Lead status ${lead.status} cannot send Email 1`);
            skipped++;
            continue;
          }
          try {
            await sendScheduledInitialEmail({
              scheduleId: claimed.id,
              tenantId: lead.tenantId,
              workspaceId: lead.workspaceId,
            });
            processed++;
          } catch (e) {
            if (e instanceof Error && e.message === "Outside send window") {
              const nextSlot = nextSendWindowStart(now, sendWindow);
              const patch =
                nextSlot.getTime() > now.getTime() ? { scheduledFor: nextSlot } : undefined;
              await releaseToScheduled(claimed.id, "Outside send window", patch);
              skipped++;
              continue;
            }
            throw e;
          }
          continue;
        }

        if (claimed.sequenceDay < 0) {
          await releaseToScheduled(claimed.id, "Non-positive sequence day is not sendable");
          skipped++;
          continue;
        }

        if (lead.status !== "outreached") {
          await cancelWithReason(claimed.id, `Lead status ${lead.status} cannot send follow-up`);
          skipped++;
          continue;
        }

        const contact = lead.contact as typeof contacts.$inferSelect;
        const account = lead.account as typeof accounts.$inferSelect;
        const research = lead.research as typeof leadResearch.$inferSelect | null;

        if (emailConfig.sendMode === "live") {
          await assertPlanEntitlement(lead.tenantId, "live_send");
          await assertCredits(lead.tenantId, "email.live", 1);
        }

        let generatedOutreach = claimed.draftLeadOutreachId
          ? await db.query.leadOutreach.findFirst({ where: eq(leadOutreach.id, claimed.draftLeadOutreachId) })
          : null;

        let outreachId = claimed.draftLeadOutreachId ?? "";
        const followUpMode = claimed.sequenceDay <= 3 ? "follow_up" : "final_reminder";

        if (!generatedOutreach) {
          if (claimed.emailKind === CATALOG_ON_OPEN_EMAIL_KIND) {
            await releaseToScheduled(claimed.id, "Catalog-on-open draft not ready");
            skipped++;
            continue;
          }
          await assertCredits(lead.tenantId, "writer.draft", 1);
          const originalOutreach = await db.query.leadOutreach.findFirst({
            where: eq(leadOutreach.leadId, claimed.leadId),
          });
          outreachId = await runWriter(claimed.leadId, {
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
              lastError: requiresReview ? "Follow-up requires review" : "Follow-up failed quality gate",
            })
            .where(eq(outreachSchedule.id, claimed.id));

          await logAudit({
            tenantId: lead.tenantId,
            workspaceId: lead.workspaceId,
            action: "sequencer.pending_review",
            entityType: "lead",
            entityId: claimed.leadId,
            metadata: {
              scheduleId: claimed.id,
              day: claimed.sequenceDay,
              outreachId: generatedOutreach.id,
              delivScore: quality.delivScore,
              rubricTotal: quality.rubricTotal,
              requiresReview,
              revisionTimeout: generatedOutreach.revisionTimeout,
            },
          });

          void notifyLeadEvent(claimed.leadId, "followup.pending_review");
          pendingReview++;
          continue;
        }

        try {
          await assertSenderPreflight(emailConfig, lead.workspaceId, {
            projectedAdditional: 1,
          });
        } catch (e) {
          if (e instanceof SenderPreflightError) {
            const reason = e.issues?.length
              ? `Sender preflight: ${e.issues.map((i) => i.label).join("; ")}`
              : "Sender preflight failed";
            console.warn("[sequencer] sender preflight failed, skipping send", e.issues);
            await releaseToScheduled(claimed.id, reason.slice(0, 500));
            skipped++;
            continue;
          }
          throw e;
        }

        if (!claimed.draftLeadOutreachId) {
          await db
            .update(outreachSchedule)
            .set({ draftLeadOutreachId: generatedOutreach.id })
            .where(eq(outreachSchedule.id, claimed.id));
        }

        if (!claimed.draftLeadOutreachId) {
          await deductCredits({
            tenantId: lead.tenantId,
            action: "writer.draft",
            referenceId: outreachId,
            idempotencyKey: `sequencer-writer-${claimed.id}`,
          });
        }

        await sendScheduledFollowUp({
          scheduleId: claimed.id,
          tenantId: lead.tenantId,
          workspaceId: lead.workspaceId,
        });

        processed++;
      } catch (e) {
        if (e instanceof InsufficientCreditsError) {
          await releaseToScheduled(claimed.id, "Insufficient credits");
          skipped++;
          continue;
        }
        if (e instanceof FollowUpQualityError) {
          await db
            .update(outreachSchedule)
            .set({
              status: "pending_review",
              lastError: errorMessage(e),
            })
            .where(eq(outreachSchedule.id, claimed.id));
          pendingReview++;
          continue;
        }
        const reason = errorMessage(e);
        console.error("[sequencer] failed for schedule", claimed.id, e);
        const outcome = await markFailedOrRetry(claimed.id, claimed.attemptCount, reason);
        if (outcome === "failed") failed++;
        else skipped++;
      }
    }

    if (due.length < BATCH_SIZE) break;
  }

  return { processed, failed, skipped, pendingReview };
}

export const SEQUENCER_MAX_ATTEMPTS = MAX_ATTEMPTS;
export const SEQUENCER_STALE_SENDING_MS = STALE_SENDING_MS;

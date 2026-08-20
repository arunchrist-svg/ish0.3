import { db, outreachSchedule, leads, contacts } from "@/db";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { logAudit } from "@/lib/audit";
import { applyBounceRejectionUpdates } from "@/lib/enrichment/email-candidate-queue";
import type { ContactEmailEntry } from "@/lib/enrichment/contact-emails";
import { extractEmailAddresses, normalizeEmailSubject } from "@/lib/email/email-address";
import {
  bounceMetaFromEvent,
  isBounceLikeEvent,
  shouldPauseSequenceForBounce,
  type ResendWebhookEvent,
} from "@/lib/email/resend-webhook";

function toDbEmailStatus(
  status?: string | null,
): typeof contacts.$inferInsert.emailStatus | undefined {
  if (status === "verified" || status === "unverified" || status === "generic" || status === "missing") {
    return status;
  }
  if (status === "bounced") return "missing";
  return undefined;
}

export async function findScheduleForBounce(params: {
  emailId?: string;
  recipient?: string;
  subject?: string;
  createdAt?: Date | string;
}): Promise<typeof outreachSchedule.$inferSelect | undefined> {
  const emailId = params.emailId?.trim();
  const recipient = params.recipient?.trim().toLowerCase();
  const subject = normalizeEmailSubject(params.subject);
  const createdAt = params.createdAt ? new Date(params.createdAt).getTime() : null;

  if (emailId) {
    const byProviderId = await db.query.outreachSchedule.findFirst({
      where: eq(outreachSchedule.resendId, emailId),
    });
    if (byProviderId) return byProviderId;
  }

  if (!recipient) return undefined;

  const matches = await db
    .select({ schedule: outreachSchedule, contactEmail: contacts.email })
    .from(outreachSchedule)
    .innerJoin(leads, eq(leads.id, outreachSchedule.leadId))
    .innerJoin(contacts, eq(contacts.id, leads.contactId))
    .where(
      and(
        eq(outreachSchedule.status, "sent"),
        or(
          sql`lower(${outreachSchedule.recipientEmail}) = ${recipient}`,
          sql`lower(${contacts.email}) = ${recipient}`,
        ),
      ),
    )
    .orderBy(desc(outreachSchedule.sentAt))
    .limit(10);

  const scored = matches.map((item) => {
    let score = 0;
    if (!item.schedule.bouncedAt) score += 2;
    if (subject && normalizeEmailSubject(item.schedule.subjectSent) === subject) score += 3;
    if (createdAt && item.schedule.sentAt) {
      const delta = Math.abs(item.schedule.sentAt.getTime() - createdAt);
      if (delta < 15 * 60 * 1000) score += 4;
      else if (delta < 6 * 60 * 60 * 1000) score += 1;
    }
    return { row: item.schedule, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.row;
}

export async function applyScheduleBounce(params: {
  row: typeof outreachSchedule.$inferSelect;
  bouncedAt: Date;
  bounceType: string;
  bounceReason: string;
  recipient?: string;
  emailId?: string;
  eventType?: string;
}): Promise<{ scheduleId: string }> {
  const { row, bouncedAt, bounceType, bounceReason, recipient, emailId, eventType } = params;

  if (!row.bouncedAt) {
    await db
      .update(outreachSchedule)
      .set({
        bouncedAt,
        bounceType,
        bounceReason: bounceReason.slice(0, 500),
        recipientEmail: row.recipientEmail ?? recipient ?? null,
        resendId: row.resendId ?? emailId ?? null,
      })
      .where(eq(outreachSchedule.id, row.id));
  }

  if (shouldPauseSequenceForBounce(bounceType)) {
    const pending = await db
      .select({ id: outreachSchedule.id })
      .from(outreachSchedule)
      .where(
        and(
          eq(outreachSchedule.leadId, row.leadId),
          inArray(outreachSchedule.status, ["scheduled", "pending_review"]),
        ),
      );
    const ids = pending.map((item) => item.id);
    if (ids.length) {
      await db.update(outreachSchedule).set({ status: "paused" }).where(inArray(outreachSchedule.id, ids));
    }
  }

  const lead = await db.query.leads.findFirst({
    where: eq(leads.id, row.leadId),
    with: { contact: true },
  });

  const bouncedAddress = (row.recipientEmail ?? recipient ?? lead?.contact?.email ?? "").trim();
  const liveBounce = row.sendMode !== "test" && Boolean(bouncedAddress);

  if (liveBounce && lead?.contact) {
    const contact = lead.contact as typeof contacts.$inferSelect;
    const rejection = applyBounceRejectionUpdates(
      {
        email: contact.email,
        emailStatus: contact.emailStatus,
        emailConfidence: contact.emailConfidence,
        enrichmentSource: contact.enrichmentSource,
        enrichmentProvider: contact.enrichmentProvider,
        alternateEmails: (contact.alternateEmails as ContactEmailEntry[] | null) ?? [],
      },
      bouncedAddress,
    );

    await db
      .update(contacts)
      .set({
        email: rejection.updates.email === undefined ? contact.email : rejection.updates.email,
        emailStatus: toDbEmailStatus(rejection.updates.emailStatus) ?? contact.emailStatus,
        emailConfidence:
          rejection.updates.emailConfidence === undefined
            ? contact.emailConfidence
            : rejection.updates.emailConfidence,
        enrichmentSource:
          rejection.updates.enrichmentSource === undefined
            ? contact.enrichmentSource
            : rejection.updates.enrichmentSource,
        enrichmentProvider:
          rejection.updates.enrichmentProvider === undefined
            ? contact.enrichmentProvider
            : rejection.updates.enrichmentProvider,
        alternateEmails:
          rejection.updates.alternateEmails === undefined
            ? contact.alternateEmails
            : rejection.updates.alternateEmails,
        updatedAt: new Date(),
      })
      .where(eq(contacts.id, contact.id));
  }

  await logAudit({
    tenantId: lead?.tenantId,
    workspaceId: lead?.workspaceId,
    action: "outreach.bounced",
    entityType: "lead",
    entityId: row.leadId,
    metadata: {
      scheduleId: row.id,
      sequenceDay: row.sequenceDay,
      emailId,
      recipient: bouncedAddress,
      bounceType,
      bounceReason,
      eventType,
    },
  });

  return { scheduleId: row.id };
}

export async function processResendBounceEvent(event: ResendWebhookEvent): Promise<{
  ok: true;
  skipped?: boolean;
  reason?: string;
  scheduleId?: string;
}> {
  if (!isBounceLikeEvent(event.type)) {
    return { ok: true, skipped: true, reason: "ignored_event" };
  }

  const emailId = event.data?.email_id?.trim();
  const recipient = extractEmailAddresses(event.data?.to)[0];
  const meta = bounceMetaFromEvent(event);
  const bouncedAt = event.created_at ? new Date(event.created_at) : new Date();

  const row = await findScheduleForBounce({
    emailId,
    recipient,
    subject: event.data?.subject,
    createdAt: event.created_at,
  });

  if (!row) {
    return { ok: true, skipped: true, reason: "schedule_not_found" };
  }

  const result = await applyScheduleBounce({
    row,
    bouncedAt,
    bounceType: meta.bounceType,
    bounceReason: meta.bounceReason,
    recipient,
    emailId,
    eventType: event.type,
  });

  return { ok: true, scheduleId: result.scheduleId };
}

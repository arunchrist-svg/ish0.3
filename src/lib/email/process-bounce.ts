import { db, outreachSchedule, leads, contacts } from "@/db";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { logAudit } from "@/lib/audit";
import { applyBounceRejectionUpdates } from "@/lib/enrichment/email-candidate-queue";
import type { ContactEmailEntry } from "@/lib/enrichment/contact-emails";
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

function firstRecipient(to?: string[]): string | undefined {
  const raw = to?.find((value) => typeof value === "string" && value.includes("@"));
  return raw?.trim().toLowerCase();
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
  const recipient = firstRecipient(event.data?.to);
  const meta = bounceMetaFromEvent(event);
  const bouncedAt = event.created_at ? new Date(event.created_at) : new Date();

  let row = emailId
    ? await db.query.outreachSchedule.findFirst({
        where: eq(outreachSchedule.resendId, emailId),
      })
    : undefined;

  if (!row && recipient) {
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
      .limit(5);
    row = matches.find((item) => !item.schedule.bouncedAt)?.schedule ?? matches[0]?.schedule;
  }

  if (!row) {
    return { ok: true, skipped: true, reason: "schedule_not_found" };
  }

  if (!row.bouncedAt) {
    await db
      .update(outreachSchedule)
      .set({
        bouncedAt,
        bounceType: meta.bounceType,
        bounceReason: meta.bounceReason.slice(0, 500),
        recipientEmail: row.recipientEmail ?? recipient ?? null,
      })
      .where(eq(outreachSchedule.id, row.id));
  }

  if (shouldPauseSequenceForBounce(meta.bounceType)) {
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
      bounceType: meta.bounceType,
      bounceReason: meta.bounceReason,
      eventType: event.type,
    },
  });

  return { ok: true, scheduleId: row.id };
}

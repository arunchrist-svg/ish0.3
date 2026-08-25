import { and, asc, desc, eq } from "drizzle-orm";
import { db, leadOutreach, leads, outreachSchedule } from "@/db";
import { pickOriginalEmailContext } from "@/lib/email/reply-context";
import { REPLY_SEQUENCE_POSITION } from "@/lib/email/outreach-templates";
import { normalizeReplySubject } from "@/lib/email/threading";

/** Create or reuse a blank reply draft (empty body) so the user can write their own reply. */
export async function ensureBlankReplyDraft(leadId: string): Promise<{
  outreachId: string;
  created: boolean;
}> {
  const existing = await db.query.leadOutreach.findFirst({
    where: and(
      eq(leadOutreach.leadId, leadId),
      eq(leadOutreach.sequencePosition, REPLY_SEQUENCE_POSITION),
      eq(leadOutreach.templateVariant, "reply"),
    ),
    orderBy: [desc(leadOutreach.createdAt)],
  });

  if (existing) {
    return { outreachId: existing.id, created: false };
  }

  const lead = await db.query.leads.findFirst({
    where: eq(leads.id, leadId),
  });
  if (!lead) throw new Error(`Lead ${leadId} not found`);

  const sentScheduleRows = await db
    .select()
    .from(outreachSchedule)
    .where(and(eq(outreachSchedule.leadId, leadId), eq(outreachSchedule.status, "sent")))
    .orderBy(asc(outreachSchedule.sentAt));

  const outreachRows = await db.query.leadOutreach.findMany({
    where: eq(leadOutreach.leadId, leadId),
  });

  const originalContext = pickOriginalEmailContext({ sentScheduleRows, outreachRows });
  const rootSubject =
    lead.threadRootSubject?.trim() ||
    originalContext.subjectA?.trim() ||
    "your note";
  const subjectA = normalizeReplySubject(rootSubject);

  const [row] = await db
    .insert(leadOutreach)
    .values({
      leadId,
      draftSource: "manual",
      promptVersion: "manual-blank-reply",
      subjectA,
      subjectB: null,
      emailBody: "",
      emailBodyB: null,
      chosenSubjectKey: "A",
      chosenBodyKey: "A",
      templateVariant: "reply",
      sequencePosition: REPLY_SEQUENCE_POSITION,
      outreachGoal: "Reply to their message",
      confidenceTier: "manual",
      deliverabilityScore: null,
      deliverabilityVerdict: null,
      revisionCount: 0,
      revisionTimeout: false,
    })
    .returning();

  return { outreachId: row.id, created: true };
}

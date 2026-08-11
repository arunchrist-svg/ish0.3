import { db, leadOutreach, leads, yieldFunnel } from "@/db";
import { eq, and, inArray, isNotNull } from "drizzle-orm";
import { runWriter, resolveWriterMode, type WriterMode } from "@/lib/agents/writer";
import type { OutreachTemplateId } from "@/lib/email/outreach-templates";
import { deleteLeadOutreachWhere } from "@/lib/outreach/delete-lead-outreach";
import { isNearParaphrase, SEQUENCE_CLONE_THRESHOLD } from "@/lib/email/email-similarity";

export type WriterSequenceOptions = {
  outreachTemplate?: OutreachTemplateId;
  forceNewAngle?: boolean;
  writerMode?: WriterMode;
};

export async function runWriterSequence(
  leadId: string,
  options?: WriterSequenceOptions,
): Promise<string[]> {
  const lead = await db.query.leads.findFirst({ where: eq(leads.id, leadId) });
  if (!lead) throw new Error(`Lead ${leadId} not found`);

  await deleteLeadOutreachWhere(
    and(
      eq(leadOutreach.leadId, leadId),
      inArray(leadOutreach.sequencePosition, [1, 2, 3]),
    ),
  );

  const template = options?.outreachTemplate;
  const writerMode = resolveWriterMode(options?.writerMode);

  const id1 = await runWriter(leadId, {
    outreachTemplate: template,
    sequencePosition: 1,
    skipStatusUpdate: false,
    writerMode,
  });

  const draft1 = await db.query.leadOutreach.findFirst({ where: eq(leadOutreach.id, id1) });
  const e1Body = draft1?.emailBody ?? "";
  const e1Subject = draft1?.subjectA ?? undefined;

  const followUp = {
    originalEmailBody: e1Body,
    originalEmailSubject: e1Subject,
    skipStatusUpdate: true,
    writerMode,
  } as const;

  let [id2, id3] = await Promise.all([
    runWriter(leadId, { ...followUp, followUpMode: "follow_up", sequencePosition: 2 }),
    runWriter(leadId, { ...followUp, followUpMode: "final_reminder", sequencePosition: 3 }),
  ]);
  id2 = await ensureDistinctSequenceStep(leadId, 2, e1Body, id2, options);
  id3 = await ensureDistinctSequenceStep(leadId, 3, e1Body, id3, options);

  await db.update(leads).set({ status: "draft_ready" }).where(eq(leads.id, leadId));
  await db.insert(yieldFunnel).values({ leadId, stage: "draft_ready", metadata: { sequence: true } });

  return [id1, id2, id3];
}

export async function loadSequenceDrafts(leadId: string) {
  return db.query.leadOutreach.findMany({
    where: and(eq(leadOutreach.leadId, leadId), isNotNull(leadOutreach.sequencePosition)),
    orderBy: (t, { asc }) => [asc(t.sequencePosition)],
  });
}

export async function regenerateSequenceStep(
  leadId: string,
  sequencePosition: 2 | 3,
  options?: WriterSequenceOptions,
): Promise<string> {
  const drafts = await loadSequenceDrafts(leadId);
  const draft1 = drafts.find((d) => d.sequencePosition === 1);
  if (!draft1?.emailBody) {
    throw new Error("Write the full sequence first (Email 1 is required)");
  }

  await deleteLeadOutreachWhere(
    and(eq(leadOutreach.leadId, leadId), eq(leadOutreach.sequencePosition, sequencePosition)),
  );

  const followUpMode = sequencePosition === 2 ? "follow_up" : "final_reminder";
  return runWriter(leadId, {
    followUpMode,
    originalEmailBody: draft1.emailBody,
    originalEmailSubject: draft1.subjectA ?? undefined,
    sequencePosition,
    skipStatusUpdate: true,
    outreachTemplate: options?.outreachTemplate,
    forceNewAngle: options?.forceNewAngle,
    writerMode: resolveWriterMode(options?.writerMode),
  });
}

export async function ensureDistinctSequenceStep(
  leadId: string,
  sequencePosition: 2 | 3,
  e1Body: string,
  outreachId: string,
  options?: WriterSequenceOptions,
): Promise<string> {
  const draft = await db.query.leadOutreach.findFirst({ where: eq(leadOutreach.id, outreachId) });
  if (!draft?.emailBody || !isNearParaphrase(draft.emailBody, e1Body, SEQUENCE_CLONE_THRESHOLD)) {
    return outreachId;
  }
  return regenerateSequenceStep(leadId, sequencePosition, { ...options, forceNewAngle: true });
}

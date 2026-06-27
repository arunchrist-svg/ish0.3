import { db, leadOutreach, leads, yieldFunnel } from "@/db";
import { eq, and, inArray, isNotNull } from "drizzle-orm";
import { runWriter } from "@/lib/agents/writer";
import type { OutreachTemplateId } from "@/lib/email/outreach-templates";

export type WriterSequenceOptions = {
  outreachTemplate?: OutreachTemplateId;
};

export async function runWriterSequence(
  leadId: string,
  options?: WriterSequenceOptions,
): Promise<string[]> {
  const lead = await db.query.leads.findFirst({ where: eq(leads.id, leadId) });
  if (!lead) throw new Error(`Lead ${leadId} not found`);

  await db
    .delete(leadOutreach)
    .where(
      and(
        eq(leadOutreach.leadId, leadId),
        inArray(leadOutreach.sequencePosition, [1, 2, 3]),
      ),
    );

  const template = options?.outreachTemplate;

  const id1 = await runWriter(leadId, {
    outreachTemplate: template,
    sequencePosition: 1,
    skipStatusUpdate: false,
  });

  const draft1 = await db.query.leadOutreach.findFirst({ where: eq(leadOutreach.id, id1) });
  const e1Body = draft1?.emailBody ?? "";

  const id2 = await runWriter(leadId, {
    followUpMode: "follow_up",
    originalEmailBody: e1Body,
    sequencePosition: 2,
    skipStatusUpdate: true,
  });

  const id3 = await runWriter(leadId, {
    followUpMode: "final_reminder",
    originalEmailBody: e1Body,
    sequencePosition: 3,
    skipStatusUpdate: true,
  });

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

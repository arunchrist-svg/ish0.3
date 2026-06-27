import type { leadOutreach, outreachEditMessages } from "@/db/schema";
export type EditMessageRow = typeof outreachEditMessages.$inferSelect;

export function toEditMessage(row: EditMessageRow) {
  return {
    id: row.id,
    role: row.role as "user" | "assistant",
    content: row.content,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toWriterDraft(
  outreach: typeof leadOutreach.$inferSelect,
  opts?: {
    approvalStatus?: string;
    replySent?: boolean;
    editMessages?: EditMessageRow[];
    sequencePosition?: number;
  },
) {
  return {
    id: outreach.id,
    subjectA: outreach.subjectA ?? undefined,
    subjectB: outreach.subjectB ?? undefined,
    emailBody: outreach.emailBody ?? undefined,
    deliverabilityScore: outreach.deliverabilityScore ?? undefined,
    deliverabilityVerdict: outreach.deliverabilityVerdict ?? undefined,
    draftSource: outreach.draftSource,
    promptVersion: outreach.promptVersion ?? undefined,
    revisionCount: outreach.revisionCount ?? 0,
    revisionTimeout: outreach.revisionTimeout ?? false,
    templateVariant: outreach.templateVariant ?? undefined,
    outreachGoal: outreach.outreachGoal ?? undefined,
    confidenceTier: outreach.confidenceTier ?? undefined,
    inboxScore: outreach.deliverabilityScore ?? undefined,
    approvalStatus: opts?.approvalStatus ?? "pending",
    replySent: opts?.replySent ?? false,
    sequencePosition: opts?.sequencePosition ?? outreach.sequencePosition ?? undefined,
    editMessages: opts?.editMessages?.map(toEditMessage),
  };
}

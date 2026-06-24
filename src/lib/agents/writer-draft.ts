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
    editMessages?: EditMessageRow[];
  },
) {
  return {
    id: outreach.id,
    subjectA: outreach.subjectA ?? undefined,
    subjectB: outreach.subjectB ?? undefined,
    emailBody: outreach.emailBody ?? undefined,
    deliverabilityScore: outreach.deliverabilityScore ?? undefined,
    deliverabilityVerdict: outreach.deliverabilityVerdict ?? undefined,
    rubricScore: (outreach.rubricScore as Record<string, number>) ?? undefined,
    rubricTotal: outreach.rubricTotal ?? undefined,
    draftSource: outreach.draftSource,
    promptVersion: outreach.promptVersion ?? undefined,
    revisionCount: outreach.revisionCount ?? 0,
    revisionTimeout: outreach.revisionTimeout ?? false,
    templateVariant: outreach.templateVariant ?? undefined,
    outreachGoal: outreach.outreachGoal ?? undefined,
    confidenceTier: outreach.confidenceTier ?? undefined,
    approvalStatus: opts?.approvalStatus ?? "pending",
    editMessages: opts?.editMessages?.map(toEditMessage),
  };
}

import { runReplyWriter } from "@/lib/agents/reply-writer";
import { notifyReplyReceived } from "@/lib/agents/notify-reply";
import { findRelatedLeads } from "@/lib/enrichment/related-leads";
import { db, leads } from "@/db";
import { eq } from "drizzle-orm";
import { extractLatestReplyText } from "@/lib/email/reply-body";

export type ReplyOrchestratorResult = {
  outreachId?: string;
  rubricTotal?: number;
  intent?: string;
  notified: { inApp: number; email: number };
  relatedCount: number;
  draftFailed: boolean;
};

export async function runReplyOrchestrator(params: {
  leadId: string;
  tenantId: string;
  workspaceId: string;
}): Promise<ReplyOrchestratorResult> {
  const lead = await db.query.leads.findFirst({
    where: eq(leads.id, params.leadId),
    with: { contact: true, account: true },
  });
  if (!lead) throw new Error(`Lead ${params.leadId} not found`);

  const replyRaw = (lead as typeof leads.$inferSelect & { lastReplyContent?: string | null }).lastReplyContent;
  const replySnippet = extractLatestReplyText(replyRaw) ?? "";

  let outreachId: string | undefined;
  let rubricTotal: number | undefined;
  let intent: string | undefined;
  let draftFailed = false;

  try {
    const result = await runReplyWriter(params.leadId);
    outreachId = result.outreachId;
    rubricTotal = result.rubricTotal;
    intent = result.intent;
  } catch (e) {
    console.error("[reply-orchestrator] draft failed", e);
    draftFailed = true;
    intent = "other";
  }

  let relatedCount = 0;
  try {
    const account = lead.account;
    const contact = lead.contact;
    const related = await findRelatedLeads({
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      companyName: account.name,
      primaryPersonName: contact.name,
      title: contact.title,
      industry: account.industry,
      city: account.city ?? undefined,
      excludeAccountId: account.id,
    });
    relatedCount = related.length;
  } catch (e) {
    console.warn("[reply-orchestrator] related leads failed", e);
  }

  const notified = await notifyReplyReceived({
    leadId: params.leadId,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    intent: { intent: (intent as "other") ?? "other", agreedTo: null },
    replySnippet,
    draftOutreachId: outreachId,
    rubricTotal,
    draftFailed,
  });

  return { outreachId, rubricTotal, intent, notified, relatedCount, draftFailed };
}

import { db, notifications, users, orgMembers, leads, contacts, accounts } from "@/db";
import { eq, and } from "drizzle-orm";
import { getResolvedEmailConfig } from "@/lib/settings/email-settings";
import { getAgentFlags } from "@/lib/settings/agent-flags";
import { smtpTransport } from "@/lib/email/smtp-transport";
import type { ReplyIntentResult } from "@/lib/email/reply-intent";

export type NotifyReplyParams = {
  leadId: string;
  tenantId: string;
  workspaceId: string;
  intent: ReplyIntentResult & { confidence?: number };
  replySnippet: string;
  draftOutreachId?: string | null;
  rubricTotal?: number | null;
  draftFailed?: boolean;
};

function urgencyForIntent(intent: ReplyIntentResult["intent"]): "urgent" | "normal" | "low" | "silent" {
  if (intent === "affirmative" || intent === "scheduling") return "urgent";
  if (intent === "question" || intent === "other") return "normal";
  if (intent === "negative") return "low";
  return "silent";
}

async function getNotifyUserIds(tenantId: string): Promise<string[]> {
  const members = await db
    .select({ userId: orgMembers.userId })
    .from(orgMembers)
    .where(and(eq(orgMembers.tenantId, tenantId), eq(orgMembers.status, "active")));
  return members.map((m) => m.userId);
}

export async function notifyReplyReceived(params: NotifyReplyParams): Promise<{ inApp: number; email: number }> {
  const flags = await getAgentFlags(params.workspaceId);
  const urgency = urgencyForIntent(params.intent.intent);
  if (urgency === "silent") return { inApp: 0, email: 0 };

  const lead = await db.query.leads.findFirst({
    where: eq(leads.id, params.leadId),
    with: { contact: true, account: true },
  });
  if (!lead) return { inApp: 0, email: 0 };

  const contact = lead.contact as typeof contacts.$inferSelect;
  const account = lead.account as typeof accounts.$inferSelect;
  const snippet = params.replySnippet.slice(0, 120);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? `http://localhost:${process.env.PORT ?? 3002}`;
  const leadUrl = `${appUrl}/leads/${params.leadId}?tab=Email`;

  const draftReady = !params.draftFailed && (params.rubricTotal ?? 0) >= 75;
  const title = draftReady
    ? `${contact.firstName ?? contact.name} replied — draft ready`
    : `${contact.firstName ?? contact.name} replied at ${account.name}`;

  const body = params.draftFailed
    ? `They said: "${snippet}" — AI draft needs your help.`
    : draftReady
      ? `They said: "${snippet}" — review your AI draft.`
      : `They said: "${snippet}" — draft needs a quick edit.`;

  const userIds = await getNotifyUserIds(params.tenantId);
  let inApp = 0;
  let email = 0;

  if (flags.notifyInApp !== false) {
    for (const userId of userIds) {
      await db.insert(notifications).values({
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        userId,
        type: "reply_received",
        leadId: params.leadId,
        title,
        body,
        urgency,
        metadata: {
          intent: params.intent.intent,
          draftOutreachId: params.draftOutreachId,
          rubricTotal: params.rubricTotal,
          leadUrl,
        },
      });
      inApp += 1;
    }
  }

  if (flags.notifyEmail !== false && urgency === "urgent") {
    const emailConfig = await getResolvedEmailConfig(params.workspaceId);
    const status = smtpTransport.getStatus(emailConfig);
    if (status.configured) {
      for (const userId of userIds) {
        const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
        if (!user?.email) continue;
        try {
          await smtpTransport.send(
            {
              to: user.email,
              subject: title,
              html: `<p>${body}</p><p><a href="${leadUrl}">Open lead workspace</a></p>`,
              text: `${body}\n\nOpen: ${leadUrl}`,
            },
            emailConfig,
            user.email,
          );
          email += 1;
        } catch (e) {
          console.error("[notify-reply] email failed", user.email, e);
        }
      }
    }
  }

  return { inApp, email };
}

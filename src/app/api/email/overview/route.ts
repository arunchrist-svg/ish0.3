import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { handleApiError } from "@/lib/api-errors";
import { db, outreachSchedule, leads, contacts, accounts, leadOutreach } from "@/db";
import { eq, and } from "drizzle-orm";
import { getResolvedEmailConfig } from "@/lib/settings/email-settings";
import { normalizeCadenceDays, type CadenceDays } from "@/lib/email/cadence";
import { suggestReplyNextAction, type ReplyNextAction } from "@/lib/email/reply-next-action";

export type ScheduledFollowUp = {
  sequenceDay: number;
  scheduledFor: string | null;
  status: "scheduled" | "sent" | "cancelled";
  outreachId: string | null;
  scheduleId: string | null;
};

export type LeadEmailRow = {
  leadId: string;
  contactName: string;
  contactEmail: string | null;
  companyName: string;
  industry: string | null;
  city: string | null;
  emailsSent: number;
  lastEmailDay: number;
  nextEmailDay: number | null;
  nextEmailDue: string | null;
  openedAt: string | null;
  queueStatus:
    | "needs_review"
    | "active"
    | "hot"
    | "replies"
    | "done";
  /** @deprecated use queueStatus */
  status: "active" | "hot" | "replied" | "stopped" | "draft_ready";
  leadStatus: string;
  hasDraftReady: boolean;
  hasInboundReply: boolean;
  hasReplyDraft: boolean;
  hasOutboundReply: boolean;
  threadStage: "sequence" | "awaiting_reply" | "they_replied" | "reply_draft" | "reply_sent" | "complete";
  draftSubject?: string | null;
  draftPreview?: string | null;
  inboundSnippet?: string | null;
  scheduledFollowUps: ScheduledFollowUp[];
  nextAction?: ReplyNextAction;
};

function buildLeadRow(
  leadId: string,
  first: {
    contactName: string;
    contactEmail: string | null;
    companyName: string;
    industry: string | null;
    city: string | null;
    leadStatus: string;
  },
  leadRows: {
    scheduleId: string;
    sequenceDay: number;
    scheduleStatus: string;
    scheduledFor: Date;
    sentAt: Date | null;
    openedAt: Date | null;
    emailKind: string | null;
    draftLeadOutreachId: string | null;
  }[],
  opts: {
    replyDraftLeadIds: Set<string>;
    needsReviewMeta?: { subject?: string | null; preview?: string | null };
    inboundSnippet?: string | null;
    cadenceDays: CadenceDays;
  },
): LeadEmailRow {
  const sentRows = leadRows.filter((r) => r.scheduleStatus === "sent");
  const scheduledRows = leadRows.filter((r) => r.scheduleStatus === "scheduled");
  const allOpens = leadRows.filter((r) => r.openedAt != null);
  const lastOpenedAt =
    allOpens.length > 0
      ? allOpens.sort((a, b) => new Date(b.openedAt!).getTime() - new Date(a.openedAt!).getTime())[0].openedAt
      : null;

  const nextScheduled = scheduledRows.sort(
    (a, b) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime(),
  )[0];

  const maxSentDay = sentRows.length > 0 ? Math.max(...sentRows.map((r) => r.sequenceDay)) : -1;
  const hasReplyDraftFromSet = opts.replyDraftLeadIds.has(leadId);

  const hasInboundReply =
    leadRows.some((r) => r.scheduleStatus === "sent" && r.emailKind === "inbound_reply") ||
    first.leadStatus === "replied";
  const hasOutboundReply = sentRows.some((r) => r.emailKind === "outbound_reply" || r.sequenceDay === -1);
  const hasReplyDraft = hasReplyDraftFromSet && first.leadStatus === "replied" && !hasOutboundReply;

  let threadStage: LeadEmailRow["threadStage"] = "sequence";
  if (hasOutboundReply) threadStage = "reply_sent";
  else if (hasReplyDraft) threadStage = "reply_draft";
  else if (hasInboundReply || first.leadStatus === "replied") threadStage = "they_replied";
  else if (first.leadStatus === "outreached" && sentRows.length > 0) threadStage = "awaiting_reply";
  else if (scheduledRows.length === 0 && sentRows.length > 0 && first.leadStatus !== "replied")
    threadStage = "complete";

  const scheduledFollowUps: ScheduledFollowUp[] = opts.cadenceDays.map((day) => {
    const row =
      scheduledRows.find((r) => r.sequenceDay === day) ??
      sentRows.find((r) => r.sequenceDay === day) ??
      leadRows.find((r) => r.sequenceDay === day);
    return {
      sequenceDay: day,
      scheduledFor: row?.scheduledFor ? new Date(row.scheduledFor).toISOString() : null,
      status: (row?.scheduleStatus as ScheduledFollowUp["status"]) ?? "scheduled",
      outreachId: row?.draftLeadOutreachId ?? null,
      scheduleId: row?.scheduleId ?? null,
    };
  });

  // Also include day 0 if present in schedule
  if (leadRows.some((r) => r.sequenceDay === 0)) {
    // already tracked via emailsSent
  }

  let queueStatus: LeadEmailRow["queueStatus"];
  if (opts.needsReviewMeta) {
    queueStatus = "needs_review";
  } else if (hasInboundReply && !hasOutboundReply) {
    queueStatus = "replies";
  } else if (allOpens.length > 0 && first.leadStatus !== "replied" && scheduledRows.length > 0) {
    queueStatus = "hot";
  } else if (scheduledRows.length === 0 && sentRows.length > 0 && first.leadStatus !== "replied") {
    queueStatus = "done";
  } else if (sentRows.length > 0) {
    queueStatus = "active";
  } else {
    queueStatus = "active";
  }

  let legacyStatus: LeadEmailRow["status"] = "active";
  if (first.leadStatus === "replied") {
    legacyStatus = hasReplyDraft ? "draft_ready" : "replied";
  } else if (allOpens.length > 0) {
    legacyStatus = "hot";
  } else if (scheduledRows.length === 0 && sentRows.length > 0) {
    legacyStatus = "stopped";
  }

  const nextAction =
    queueStatus === "replies"
      ? suggestReplyNextAction({
          hasReplyDraft,
          hasOutboundReply,
          inboundSnippet: opts.inboundSnippet,
        })
      : undefined;

  return {
    leadId,
    contactName: first.contactName,
    contactEmail: first.contactEmail,
    companyName: first.companyName,
    industry: first.industry,
    city: first.city,
    emailsSent: sentRows.length,
    lastEmailDay: maxSentDay,
    nextEmailDay: nextScheduled?.sequenceDay ?? null,
    nextEmailDue: nextScheduled ? new Date(nextScheduled.scheduledFor).toISOString() : null,
    openedAt: lastOpenedAt ? new Date(lastOpenedAt).toISOString() : null,
    queueStatus,
    status: legacyStatus,
    leadStatus: first.leadStatus,
    hasDraftReady: hasReplyDraftFromSet,
    hasInboundReply,
    hasReplyDraft,
    hasOutboundReply,
    threadStage,
    draftSubject: opts.needsReviewMeta?.subject,
    draftPreview: opts.needsReviewMeta?.preview,
    inboundSnippet: opts.inboundSnippet,
    scheduledFollowUps,
    nextAction,
  };
}

export async function GET() {
  try {
    const ctx = await requireTenantContext();
    const emailConfig = await getResolvedEmailConfig(ctx.workspaceId);
    const cadenceDays = normalizeCadenceDays(emailConfig.cadenceDays);

    const rows = await db
      .select({
        scheduleId: outreachSchedule.id,
        leadId: outreachSchedule.leadId,
        sequenceDay: outreachSchedule.sequenceDay,
        scheduleStatus: outreachSchedule.status,
        scheduledFor: outreachSchedule.scheduledFor,
        sentAt: outreachSchedule.sentAt,
        openedAt: outreachSchedule.openedAt,
        emailKind: outreachSchedule.emailKind,
        draftLeadOutreachId: outreachSchedule.draftLeadOutreachId,
        leadStatus: leads.status,
        contactName: contacts.name,
        contactEmail: contacts.email,
        companyName: accounts.name,
        industry: accounts.industry,
        city: accounts.city,
        lastReplyContent: leads.lastReplyContent,
      })
      .from(outreachSchedule)
      .innerJoin(leads, eq(outreachSchedule.leadId, leads.id))
      .innerJoin(contacts, eq(leads.contactId, contacts.id))
      .innerJoin(accounts, eq(leads.accountId, accounts.id))
      .where(eq(leads.workspaceId, ctx.workspaceId));

    const replyDrafts = await db
      .select({ leadId: leadOutreach.leadId })
      .from(leadOutreach)
      .where(eq(leadOutreach.templateVariant, "reply"));

    const replyDraftLeadIds = new Set(replyDrafts.map((r) => r.leadId));

    const needsReviewLeads = await db
      .select({
        leadId: leads.id,
        leadStatus: leads.status,
        contactName: contacts.name,
        contactEmail: contacts.email,
        companyName: accounts.name,
        industry: accounts.industry,
        city: accounts.city,
        lastReplyContent: leads.lastReplyContent,
        subjectA: leadOutreach.subjectA,
        emailBody: leadOutreach.emailBody,
      })
      .from(leads)
      .innerJoin(contacts, eq(leads.contactId, contacts.id))
      .innerJoin(accounts, eq(leads.accountId, accounts.id))
      .innerJoin(
        leadOutreach,
        and(
          eq(leadOutreach.leadId, leads.id),
          eq(leadOutreach.sequencePosition, 1),
        ),
      )
      .where(
        and(
          eq(leads.workspaceId, ctx.workspaceId),
          eq(leads.status, "draft_ready"),
        ),
      );

    const byLead = new Map<string, typeof rows>();
    for (const row of rows) {
      if (!byLead.has(row.leadId)) byLead.set(row.leadId, []);
      byLead.get(row.leadId)!.push(row);
    }

    const result: LeadEmailRow[] = [];
    const seenLeadIds = new Set<string>();

    for (const [leadId, leadRows] of byLead) {
      seenLeadIds.add(leadId);
      const first = leadRows[0];
      result.push(
        buildLeadRow(
          leadId,
          first,
          leadRows.map((r) => ({
            scheduleId: r.scheduleId,
            sequenceDay: r.sequenceDay,
            scheduleStatus: r.scheduleStatus,
            scheduledFor: r.scheduledFor,
            sentAt: r.sentAt,
            openedAt: r.openedAt,
            emailKind: r.emailKind,
            draftLeadOutreachId: r.draftLeadOutreachId,
          })),
          {
            replyDraftLeadIds,
            inboundSnippet: first.lastReplyContent,
            cadenceDays,
          },
        ),
      );
    }

    for (const nr of needsReviewLeads) {
      if (seenLeadIds.has(nr.leadId)) continue;
      seenLeadIds.add(nr.leadId);
      result.push(
        buildLeadRow(
          nr.leadId,
          {
            contactName: nr.contactName,
            contactEmail: nr.contactEmail,
            companyName: nr.companyName,
            industry: nr.industry,
            city: nr.city,
            leadStatus: nr.leadStatus,
          },
          [],
          {
            replyDraftLeadIds,
            needsReviewMeta: {
              subject: nr.subjectA,
              preview: nr.emailBody?.slice(0, 160) ?? null,
            },
            cadenceDays,
          },
        ),
      );
    }

    const needsReview = result.filter((r) => r.queueStatus === "needs_review");
    const replies = result.filter((r) => r.queueStatus === "replies");
    const hot = result.filter((r) => r.queueStatus === "hot");
    const active = result.filter((r) => r.queueStatus === "active");
    const done = result.filter((r) => r.queueStatus === "done");

    const totalSent = result.reduce((s, r) => s + r.emailsSent, 0);
    const opened = result.filter((r) => r.openedAt != null).length;
    const replied = result.filter((r) => r.hasInboundReply).length;
    const dueToday = result.filter((r) => {
      if (!r.nextEmailDue) return false;
      const due = new Date(r.nextEmailDue);
      const now = new Date();
      const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      return due <= todayEnd;
    }).length;

    const draftReady = result.filter((r) => r.status === "draft_ready" || r.hasReplyDraft);
    const stopped = done;

    return NextResponse.json({
      cadenceDays,
      stats: {
        totalSent,
        opened,
        replied,
        dueToday,
        total: result.length,
        needsReview: needsReview.length,
        replies: replies.length,
      },
      needsReview,
      replies,
      hot,
      active,
      done,
      draftReady,
      stopped,
    });
  } catch (e) {
    return handleApiError(e, "[api/email/overview]");
  }
}

import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { handleApiError } from "@/lib/api-errors";
import { db, outreachSchedule, leads, contacts, accounts, leadOutreach } from "@/db";
import { eq, and } from "drizzle-orm";
import { getResolvedEmailConfig } from "@/lib/settings/email-settings";
import { normalizeCadenceDays, type CadenceDays } from "@/lib/email/cadence";
import { suggestReplyNextAction, type ReplyNextAction } from "@/lib/email/reply-next-action";
import { deriveSequenceState, type SequenceControlState } from "@/lib/outreach/sequence-control";

export type ScheduledFollowUp = {
  sequenceDay: number;
  scheduledFor: string | null;
  status: "scheduled" | "sent" | "cancelled" | "paused";
  openedAt: string | null;
  outreachId: string | null;
  scheduleId: string | null;
};

export type SequenceEmailStatus = {
  sequenceDay: number;
  label: string;
  status: "scheduled" | "sent" | "cancelled" | "paused" | "upcoming";
  openedAt: string | null;
  scheduledFor: string | null;
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
  /** Per-step open/send status for E1 + cadence follow-ups */
  sequenceEmails: SequenceEmailStatus[];
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
  sequenceState: SequenceControlState;
  nextAction?: ReplyNextAction;
  pendingFollowUpScheduleId?: string | null;
  followUpSequenceDay?: number | null;
  draftOutreachId?: string | null;
  isFollowUpReview?: boolean;
  revisionTimeout?: boolean | null;
  deliverabilityScore?: number | null;
  rubricTotal?: number | null;
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
    needsReviewMeta?: { subject?: string | null; preview?: string | null; followUp?: boolean };
    qualityMeta?: { revisionTimeout?: boolean | null; deliverabilityScore?: number | null; rubricTotal?: number | null };
    pendingFollowUpScheduleId?: string | null;
    followUpSequenceDay?: number | null;
    inboundSnippet?: string | null;
    draftOutreachId?: string | null;
    cadenceDays: CadenceDays;
  },
): LeadEmailRow {
  const sentRows = leadRows.filter((r) => r.scheduleStatus === "sent");
  const scheduledRows = leadRows.filter((r) => r.scheduleStatus === "scheduled");
  const pausedRows = leadRows.filter((r) => r.scheduleStatus === "paused");
  const allOpens = leadRows.filter((r) => r.openedAt != null);
  const lastOpenedAt =
    allOpens.length > 0
      ? allOpens.sort((a, b) => new Date(b.openedAt!).getTime() - new Date(a.openedAt!).getTime())[0].openedAt
      : null;

  const nextScheduled = [...scheduledRows, ...pausedRows].sort(
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
      openedAt: row?.openedAt ? new Date(row.openedAt).toISOString() : null,
      outreachId: row?.draftLeadOutreachId ?? null,
      scheduleId: row?.scheduleId ?? null,
    };
  });

  const stepDays = [0, ...opts.cadenceDays];
  const sequenceEmails: SequenceEmailStatus[] = stepDays.map((day, idx) => {
    const row =
      leadRows.find((r) => r.sequenceDay === day && r.scheduleStatus === "sent") ??
      leadRows.find((r) => r.sequenceDay === day && r.scheduleStatus === "scheduled") ??
      leadRows.find((r) => r.sequenceDay === day && r.scheduleStatus === "paused") ??
      leadRows.find((r) => r.sequenceDay === day);
    const status: SequenceEmailStatus["status"] = row
      ? ((row.scheduleStatus as SequenceEmailStatus["status"]) || "upcoming")
      : "upcoming";
    return {
      sequenceDay: day,
      label: `E${idx + 1}`,
      status: ["scheduled", "sent", "cancelled", "paused"].includes(status) ? status : "upcoming",
      openedAt: row?.openedAt ? new Date(row.openedAt).toISOString() : null,
      scheduledFor: row?.scheduledFor ? new Date(row.scheduledFor).toISOString() : null,
      scheduleId: row?.scheduleId ?? null,
    };
  });

  // Also include day 0 if present in schedule
  if (leadRows.some((r) => r.sequenceDay === 0)) {
    // already tracked via emailsSent / sequenceEmails
  }

  let queueStatus: LeadEmailRow["queueStatus"];
  if (opts.needsReviewMeta) {
    queueStatus = "needs_review";
  } else if (hasInboundReply && !hasOutboundReply) {
    queueStatus = "replies";
  } else if (allOpens.length > 0 && first.leadStatus !== "replied" && (scheduledRows.length > 0 || pausedRows.length > 0)) {
    queueStatus = "hot";
  } else if (scheduledRows.length === 0 && pausedRows.length === 0 && sentRows.length > 0 && first.leadStatus !== "replied") {
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
  } else if (scheduledRows.length === 0 && pausedRows.length === 0 && sentRows.length > 0) {
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
    sequenceEmails,
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
    sequenceState: deriveSequenceState(first.leadStatus, leadRows.map((r) => ({ sequenceDay: r.sequenceDay, status: r.scheduleStatus }))),
    nextAction,
    pendingFollowUpScheduleId: opts.pendingFollowUpScheduleId ?? null,
    followUpSequenceDay: opts.followUpSequenceDay ?? null,
    draftOutreachId: opts.draftOutreachId ?? null,
    isFollowUpReview: Boolean(opts.needsReviewMeta?.followUp),
    revisionTimeout: opts.qualityMeta?.revisionTimeout ?? null,
    deliverabilityScore: opts.qualityMeta?.deliverabilityScore ?? null,
    rubricTotal: opts.qualityMeta?.rubricTotal ?? null,
  };
}

type QueueTabKey = "needs_review" | "active" | "hot" | "replies" | "done";

const ALL_TABS: QueueTabKey[] = ["needs_review", "active", "hot", "replies", "done"];

function parseTabsParam(searchParams: URLSearchParams): QueueTabKey[] {
  const raw = searchParams.get("tabs") ?? searchParams.get("tab");
  if (!raw || raw === "all") return ALL_TABS;
  const requested = raw.split(",").map((t) => t.trim()) as QueueTabKey[];
  const valid = requested.filter((t) => ALL_TABS.includes(t));
  return valid.length > 0 ? valid : ["needs_review"];
}

export async function GET(req: Request) {
  try {
    const ctx = await requireTenantContext();
    const { searchParams } = new URL(req.url);
    const tabsToInclude = parseTabsParam(searchParams);
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


    const pendingFollowUps = await db
      .select({
        leadId: leads.id,
        scheduleId: outreachSchedule.id,
        sequenceDay: outreachSchedule.sequenceDay,
        leadStatus: leads.status,
        contactName: contacts.name,
        contactEmail: contacts.email,
        companyName: accounts.name,
        industry: accounts.industry,
        city: accounts.city,
        lastReplyContent: leads.lastReplyContent,
        subjectA: leadOutreach.subjectA,
        emailBody: leadOutreach.emailBody,
        draftOutreachId: leadOutreach.id,
        revisionTimeout: leadOutreach.revisionTimeout,
        deliverabilityScore: leadOutreach.deliverabilityScore,
        rubricTotal: leadOutreach.rubricTotal,
      })
      .from(outreachSchedule)
      .innerJoin(leads, eq(outreachSchedule.leadId, leads.id))
      .innerJoin(contacts, eq(leads.contactId, contacts.id))
      .innerJoin(accounts, eq(leads.accountId, accounts.id))
      .leftJoin(leadOutreach, eq(leadOutreach.id, outreachSchedule.draftLeadOutreachId))
      .where(
        and(
          eq(leads.workspaceId, ctx.workspaceId),
          eq(outreachSchedule.status, "pending_review"),
        ),
      );

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
        draftOutreachId: leadOutreach.id,
        revisionTimeout: leadOutreach.revisionTimeout,
        deliverabilityScore: leadOutreach.deliverabilityScore,
        rubricTotal: leadOutreach.rubricTotal,
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
            qualityMeta: {
              revisionTimeout: nr.revisionTimeout,
              deliverabilityScore: nr.deliverabilityScore,
              rubricTotal: nr.rubricTotal,
            },
            draftOutreachId: nr.draftOutreachId,
            cadenceDays,
          },
        ),
      );
    }


    for (const pf of pendingFollowUps) {
      if (seenLeadIds.has(pf.leadId)) {
        const existing = result.find((r) => r.leadId === pf.leadId);
        if (existing) {
          existing.queueStatus = "needs_review";
          existing.pendingFollowUpScheduleId = pf.scheduleId;
          existing.followUpSequenceDay = pf.sequenceDay;
          existing.draftSubject = pf.subjectA;
          existing.draftPreview = pf.emailBody?.slice(0, 160) ?? null;
          existing.draftOutreachId = pf.draftOutreachId ?? null;
          existing.isFollowUpReview = true;
          existing.revisionTimeout = pf.revisionTimeout ?? null;
          existing.deliverabilityScore = pf.deliverabilityScore ?? null;
          existing.rubricTotal = pf.rubricTotal ?? null;
        }
        continue;
      }
      seenLeadIds.add(pf.leadId);
      result.push(
        buildLeadRow(
          pf.leadId,
          {
            contactName: pf.contactName,
            contactEmail: pf.contactEmail,
            companyName: pf.companyName,
            industry: pf.industry,
            city: pf.city,
            leadStatus: pf.leadStatus,
          },
          [],
          {
            replyDraftLeadIds,
            needsReviewMeta: {
              subject: pf.subjectA,
              preview: pf.emailBody?.slice(0, 160) ?? null,
              followUp: true,
            },
            qualityMeta: {
              revisionTimeout: pf.revisionTimeout,
              deliverabilityScore: pf.deliverabilityScore,
              rubricTotal: pf.rubricTotal,
            },
            pendingFollowUpScheduleId: pf.scheduleId,
            followUpSequenceDay: pf.sequenceDay,
            draftOutreachId: pf.draftOutreachId,
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

    const tabCounts = {
      needs_review: needsReview.length,
      active: active.length,
      hot: hot.length,
      replies: replies.length,
      done: done.length,
    };

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

    const include = (tab: QueueTabKey) => tabsToInclude.includes(tab);
    const empty: LeadEmailRow[] = [];

    return NextResponse.json({
      outreachPaused: emailConfig.outreachPaused ?? false,
      sendMode: emailConfig.sendMode,
      cadenceDays,
      stats: {
        totalSent,
        opened,
        replied,
        dueToday,
        total: result.length,
        needsReview: tabCounts.needs_review,
        replies: tabCounts.replies,
        tabCounts,
      },
      needsReview: include("needs_review") ? needsReview : empty,
      replies: include("replies") ? replies : empty,
      hot: include("hot") ? hot : empty,
      active: include("active") ? active : empty,
      done: include("done") ? done : empty,
      draftReady: include("needs_review") ? draftReady : empty,
      stopped: include("done") ? stopped : empty,
    });
  } catch (e) {
    return handleApiError(e, "[api/email/overview]");
  }
}

import type { leads, leadOutreach, outreachSchedule } from "@/db/schema";
import { normalizeReplySubject, stripReplyPrefix } from "@/lib/email/threading";

export type ThreadEventKind = "initial" | "followup" | "inbound_reply" | "outbound_reply" | "scheduled" | "draft";
export type ThreadEventStatus = "sent" | "scheduled" | "cancelled" | "draft";

export type ThreadPhase =
  | "compose"
  | "outreached"
  | "awaiting_reply"
  | "they_replied"
  | "drafting_reply"
  | "reply_sent"
  | "complete";

export type BarMode = "hidden" | "drafts" | "sequence" | "reply";

export type BarNodeState = "done" | "current" | "upcoming" | "scheduled";

export type BarNodeKind = "draft" | "sent" | "scheduled" | "inbound" | "reply_draft";

export type BarNode = {
  id: string;
  label: string;
  state: BarNodeState;
  kind: BarNodeKind;
  outreachId?: string;
  scheduleId?: string;
  daysUntil?: number;
  subject?: string;
  body?: string;
  snippet?: string;
  at?: string;
  action?: "draft_reply";
};

export type ThreadEvent = {
  id: string;
  kind: ThreadEventKind;
  label: string;
  subject?: string;
  snippet?: string;
  body?: string;
  at?: string;
  status: ThreadEventStatus;
  sequenceDay?: number;
};

export type EmailThread = {
  threadRootSubject?: string;
  phase: ThreadPhase;
  nextAction: "send_reply" | "await_reply" | "followup_due" | "compose" | "complete";
  nextStep: { title: string; description: string; primaryAction?: string };
  barMode: BarMode;
  barNodes: BarNode[];
  selectedNodeId?: string;
  events: ThreadEvent[];
  inboundSnippet?: string;
  showComposeZone: boolean;
};

type LeadRow = typeof leads.$inferSelect;
type ScheduleRow = typeof outreachSchedule.$inferSelect;
type OutreachRow = typeof leadOutreach.$inferSelect;

function clip(text: string | null | undefined, max = 500): string | undefined {
  if (!text?.trim()) return undefined;
  const s = text.trim();
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function preview(text: string | null | undefined, max = 140): string | undefined {
  if (!text?.trim()) return undefined;
  const s = text.trim().replace(/\s+/g, " ");
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function daysUntil(scheduledFor: Date | string): number {
  const ms = new Date(scheduledFor).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

function inferKind(row: ScheduleRow): ThreadEventKind {
  const k = row.emailKind as ThreadEventKind | null;
  if (k === "initial" || k === "followup" || k === "outbound_reply" || k === "inbound_reply") return k;
  if (row.sequenceDay === 0) return "initial";
  if (row.sequenceDay === -1) return "outbound_reply";
  if (row.sequenceDay === -2) return "inbound_reply";
  if (row.sequenceDay > 0) return "followup";
  return "initial";
}

export function buildEmailThread(params: {
  lead: LeadRow;
  scheduleRows: ScheduleRow[];
  sequenceDrafts?: OutreachRow[];
  latestOutreach?: OutreachRow | null;
  replyDraftSent?: boolean;
  outreachBodiesByApprovalId?: Record<string, string>;
  inboundReplyAt?: string | null;
  cadenceDays?: number[];
}): EmailThread {
  const {
    lead,
    scheduleRows,
    sequenceDrafts = [],
    latestOutreach,
    replyDraftSent = false,
    outreachBodiesByApprovalId = {},
    inboundReplyAt,
    cadenceDays = [3, 7],
  } = params;

  const events: ThreadEvent[] = [];
  const sorted = [...scheduleRows].sort((a, b) => {
    const ta = a.sentAt ?? a.scheduledFor;
    const tb = b.sentAt ?? b.scheduledFor;
    return new Date(ta).getTime() - new Date(tb).getTime();
  });

  const bodyForRow = (row: ScheduleRow) =>
    row.bodySnippet ??
    (row.approvalId ? outreachBodiesByApprovalId[row.approvalId] : undefined);

  for (const row of sorted) {
    const kind = inferKind(row);
    if (row.status === "cancelled") continue;
    const isScheduled = row.status === "scheduled";
    const body = bodyForRow(row);
    events.push({
      id: row.id,
      kind: isScheduled ? "scheduled" : kind,
      label: isScheduled ? `Follow-up (day ${row.sequenceDay})` : kind,
      subject: row.subjectSent ?? undefined,
      snippet: kind === "inbound_reply" ? preview(lead.lastReplyContent) : preview(body),
      body: kind === "inbound_reply" ? clip(lead.lastReplyContent) : clip(body),
      at: (row.sentAt ?? (isScheduled ? row.scheduledFor : undefined))?.toISOString(),
      status: isScheduled ? "scheduled" : "sent",
      sequenceDay: row.sequenceDay,
    });
  }

  const hasInboundRow = scheduleRows.some((r) => r.emailKind === "inbound_reply" || r.sequenceDay === -2);
  const hasInbound = hasInboundRow || lead.status === "replied" || Boolean(lead.lastReplyContent);
  const hasOutboundReply = scheduleRows.some((r) => r.emailKind === "outbound_reply" || r.sequenceDay === -1);
  const initialSent = scheduleRows.some((r) => r.status === "sent" && (r.sequenceDay === 0 || r.emailKind === "initial"));
  const pendingFollowup = scheduleRows.some((r) => r.status === "scheduled" && r.sequenceDay > 0);
  const isReplyDraft = latestOutreach?.templateVariant === "reply";

  if (hasInbound && !hasInboundRow) {
    events.push({
      id: `inbound-synth-${lead.id}`,
      kind: "inbound_reply",
      label: "They replied",
      snippet: preview(lead.lastReplyContent),
      body: clip(lead.lastReplyContent),
      at: inboundReplyAt ?? undefined,
      status: "sent",
      sequenceDay: -2,
    });
  }

  const threadRootSubject =
    lead.threadRootSubject ??
    sorted.find((r) => r.sequenceDay === 0)?.subjectSent ??
    (latestOutreach?.subjectA ? stripReplyPrefix(latestOutreach.subjectA) : undefined);

  let phase: ThreadPhase = "compose";
  if (["tasting_sent", "negotiate", "closed", "po_closed", "meeting"].includes(lead.status)) {
    phase = "complete";
  } else if (hasOutboundReply) {
    phase = "reply_sent";
  } else if (isReplyDraft && lead.status === "replied") {
    phase = "drafting_reply";
  } else if (hasInbound || lead.status === "replied") {
    phase = "they_replied";
  } else if (initialSent || lead.status === "outreached") {
    phase = "awaiting_reply";
  } else if (lead.status === "draft_ready" || sequenceDrafts.length > 0 || latestOutreach) {
    phase = "compose";
  }

  let nextAction: EmailThread["nextAction"] = "compose";
  if (phase === "drafting_reply") nextAction = "send_reply";
  else if (phase === "they_replied" && !isReplyDraft) nextAction = "send_reply";
  else if (phase === "awaiting_reply" && pendingFollowup) nextAction = "followup_due";
  else if (phase === "awaiting_reply") nextAction = "await_reply";
  else if (phase === "reply_sent") nextAction = "complete";
  else if (phase === "complete") nextAction = "complete";

  const nextStep = buildNextStep(phase, nextAction, pendingFollowup);

  const showComposeZone =
    (phase === "compose" || phase === "drafting_reply" || lead.status === "draft_ready") &&
    !(isReplyDraft && replyDraftSent);

  const { barMode, barNodes } = buildBarNodes({
    lead,
    scheduleRows: sorted,
    sequenceDrafts,
    latestOutreach,
    initialSent,
    hasInbound,
    isReplyDraft,
    replyDraftSent,
    cadenceDays,
    outreachBodiesByApprovalId,
  });

  const selectedNodeId = barNodes.find((n) => n.state === "current")?.id ?? barNodes[barNodes.length - 1]?.id;

  return {
    threadRootSubject: threadRootSubject ? normalizeReplySubject(threadRootSubject) : undefined,
    phase,
    nextAction,
    nextStep,
    barMode,
    barNodes,
    selectedNodeId,
    events,
    inboundSnippet: clip(lead.lastReplyContent, 300),
    showComposeZone,
  };
}

function buildBarNodes(params: {
  lead: LeadRow;
  scheduleRows: ScheduleRow[];
  sequenceDrafts: OutreachRow[];
  latestOutreach?: OutreachRow | null;
  initialSent: boolean;
  hasInbound: boolean;
  isReplyDraft: boolean;
  replyDraftSent: boolean;
  cadenceDays: number[];
  outreachBodiesByApprovalId: Record<string, string>;
}): { barMode: BarMode; barNodes: BarNode[] } {
  const {
    lead,
    scheduleRows,
    sequenceDrafts,
    latestOutreach,
    initialSent,
    hasInbound,
    isReplyDraft,
    replyDraftSent,
    cadenceDays,
    outreachBodiesByApprovalId,
  } = params;

  const sortedDrafts = [...sequenceDrafts].sort(
    (a, b) => (a.sequencePosition ?? 99) - (b.sequencePosition ?? 99),
  );

  if (hasInbound || lead.status === "replied") {
    const e1Row = scheduleRows.find((r) => r.sequenceDay === 0 && r.status === "sent");
    const e1Body = e1Row?.bodySnippet ?? (e1Row?.approvalId ? outreachBodiesByApprovalId[e1Row.approvalId] : undefined);
    const nodes: BarNode[] = [
      {
        id: "e1",
        label: "E1",
        state: "done",
        kind: "sent",
        scheduleId: e1Row?.id,
        subject: e1Row?.subjectSent ?? undefined,
        body: clip(e1Body),
        snippet: preview(e1Body),
        at: e1Row?.sentAt?.toISOString(),
      },
      {
        id: "reply",
        label: "Reply",
        state: isReplyDraft && !replyDraftSent ? "current" : hasInbound ? "current" : "upcoming",
        kind: isReplyDraft ? "reply_draft" : "inbound",
        outreachId: isReplyDraft ? latestOutreach?.id : undefined,
        subject: isReplyDraft ? latestOutreach?.subjectA ?? undefined : undefined,
        body: isReplyDraft ? clip(latestOutreach?.emailBody) : clip(lead.lastReplyContent),
        snippet: isReplyDraft ? preview(latestOutreach?.emailBody) : preview(lead.lastReplyContent),
        action: !isReplyDraft ? "draft_reply" : undefined,
      },
    ];
    return { barMode: "reply", barNodes: nodes };
  }

  if (initialSent) {
    const nodes: BarNode[] = [];
    const e1Row = scheduleRows.find((r) => r.sequenceDay === 0 && r.status === "sent");
    const e1Body = e1Row?.bodySnippet ?? (e1Row?.approvalId ? outreachBodiesByApprovalId[e1Row.approvalId] : undefined);
    nodes.push({
      id: "e1",
      label: "E1",
      state: "done",
      kind: "sent",
      scheduleId: e1Row?.id,
      subject: e1Row?.subjectSent ?? undefined,
      body: clip(e1Body),
      snippet: preview(e1Body),
      at: e1Row?.sentAt?.toISOString(),
    });

    const followupSchedules = scheduleRows
      .filter((r) => r.sequenceDay > 0)
      .sort((a, b) => a.sequenceDay - b.sequenceDay);

  const cadence = cadenceDays.length >= 2 ? cadenceDays : [3, 7];
    for (let i = 0; i < cadence.length; i++) {
      const day = cadence[i];
      const row = followupSchedules.find((r) => r.sequenceDay === day) ?? followupSchedules[i];
      const emailNum = i + 2;
      const isSent = row?.status === "sent";
      const isScheduled = row?.status === "scheduled";
      const body = row ? bodyForScheduleRow(row, outreachBodiesByApprovalId) : undefined;
      const days = row && isScheduled ? daysUntil(row.scheduledFor) : undefined;

      const linkedDraft = sortedDrafts.find((d) => d.sequencePosition === emailNum);
      nodes.push({
        id: `e${emailNum}`,
        label: isSent ? `E${emailNum}` : `E${emailNum} (${days ?? day}D)`,
        state: isSent ? "done" : isScheduled ? "scheduled" : "upcoming",
        kind: isSent ? "sent" : "scheduled",
        scheduleId: row?.id,
        outreachId: row?.draftLeadOutreachId ?? linkedDraft?.id,
        daysUntil: days,
        subject: row?.subjectSent ?? linkedDraft?.subjectA ?? undefined,
        body: clip(body ?? linkedDraft?.emailBody),
        snippet: preview(body ?? linkedDraft?.emailBody),
        at: row?.sentAt?.toISOString() ?? (isScheduled ? row?.scheduledFor?.toISOString() : undefined),
      });
    }

    return { barMode: "sequence", barNodes: nodes };
  }

  if (sortedDrafts.length > 0) {
    const nodes: BarNode[] = sortedDrafts.map((d, i) => ({
      id: `draft-${d.sequencePosition ?? i + 1}`,
      label: `Draft ${d.sequencePosition ?? i + 1}`,
      state: i === 0 ? "current" : "upcoming",
      kind: "draft" as const,
      outreachId: d.id,
      subject: d.subjectA ?? undefined,
      body: clip(d.emailBody),
      snippet: preview(d.emailBody),
    }));
    if (nodes.length > 0) nodes[0].state = "current";
    return { barMode: "drafts", barNodes: nodes };
  }

  return { barMode: "hidden", barNodes: [] };
}

function bodyForScheduleRow(row: ScheduleRow, outreachBodiesByApprovalId: Record<string, string>) {
  return row.bodySnippet ?? (row.approvalId ? outreachBodiesByApprovalId[row.approvalId] : undefined);
}

function buildNextStep(
  phase: ThreadPhase,
  nextAction: EmailThread["nextAction"],
  pendingFollowup: boolean,
): EmailThread["nextStep"] {
  switch (phase) {
    case "compose":
      return {
        title: "Review your sequence",
        description: "Three drafts are ready. Edit each, then send Email 1.",
        primaryAction: undefined,
      };
    case "awaiting_reply":
      return pendingFollowup
        ? {
            title: "Awaiting their reply",
            description: "Email 1 is sent. Follow-ups are scheduled.",
            primaryAction: undefined,
          }
        : {
            title: "Awaiting their reply",
            description: "Your email is in their inbox.",
            primaryAction: undefined,
          };
    case "they_replied":
      return {
        title: "They replied",
        description: "Draft a reply that continues the thread.",
        primaryAction: "Regenerate reply",
      };
    case "drafting_reply":
      return {
        title: "Send your reply",
        description: "Review and send in thread.",
        primaryAction: "Send Reply",
      };
    case "reply_sent":
      return {
        title: "Reply sent",
        description: "Move the lead forward when ready.",
        primaryAction: "Mark tasting sent",
      };
    case "complete":
      return {
        title: "Outreach complete",
        description: "Email thread is closed for this stage.",
        primaryAction: undefined,
      };
    default:
      return {
        title: "Email outreach",
        description: nextAction === "followup_due" ? "Follow-up scheduled." : "Continue outreach.",
        primaryAction: undefined,
      };
  }
}

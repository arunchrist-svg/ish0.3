import type { leads, leadOutreach, outreachSchedule } from "@/db/schema";
import { normalizeReplySubject } from "@/lib/email/threading";
import { resolveDraftSubject } from "@/lib/email/draft-variants";
import { deriveSequenceState, type SequenceControlState } from "@/lib/outreach/sequence-control-shared";
import { emailStepLabel, normalizeCadenceDays } from "@/lib/email/cadence";
import {
  CATALOG_ON_OPEN_EMAIL_KIND,
  CATALOG_ON_OPEN_SEQUENCE_POSITION,
  IF_OPENED_NODE_ID,
  isCatalogOnOpenDraft,
  isCatalogOnOpenSchedule,
} from "@/lib/email/ish-festive-catalog";
import { IF_REPLIED_NODE_ID } from "@/lib/email/blank-reply-constants";

export function isSequenceRailPosition(pos: number | null | undefined): boolean {
  return pos === 1 || pos === 2 || pos === 3 || pos === CATALOG_ON_OPEN_SEQUENCE_POSITION;
}

export function sequenceRailNodeId(pos: number): string {
  if (pos === CATALOG_ON_OPEN_SEQUENCE_POSITION) return IF_OPENED_NODE_ID;
  return `draft-${pos}`;
}

export function sequenceRailLabel(pos: number, cadenceDays: [number, number]): string {
  if (pos === CATALOG_ON_OPEN_SEQUENCE_POSITION) return "If Opened";
  if (pos === 1) return "Email 1";
  if (pos === 2) return `Email 2 (+${cadenceDays[0]}d)`;
  if (pos === 3) return `Email 3 (+${cadenceDays[1]}d)`;
  return `Email ${pos}`;
}

/** Lightweight draft shape used to rebuild the compose-phase rail on the client. */
export type DraftRailSource = {
  id: string;
  sequencePosition?: number | null;
  templateVariant?: string | null;
  subjectA?: string | null;
  subjectB?: string | null;
  chosenSubjectKey?: string | null;
  emailBody?: string | null;
};

/**
 * Optimistic drafts-mode thread after Writer / blank-sequence create.
 * Keeps Email 1–3 (+ If Opened when present) selectable before the next lead fetch.
 */
export function buildDraftsEmailThread(
  drafts: DraftRailSource[],
  opts?: { cadenceDays?: [number, number]; previous?: EmailThread | null },
): EmailThread | undefined {
  const cadencePair: [number, number] = opts?.cadenceDays ?? [
    opts?.previous?.cadenceDays?.[0] ?? 3,
    opts?.previous?.cadenceDays?.[1] ?? 7,
  ];
  const railDrafts = [...drafts]
    .filter((d) => isSequenceRailPosition(d.sequencePosition))
    .sort((a, b) => (a.sequencePosition ?? 99) - (b.sequencePosition ?? 99));
  if (railDrafts.length === 0) return opts?.previous ?? undefined;

  const email1 = railDrafts.find((d) => d.sequencePosition === 1) ?? railDrafts[0];
  const email1Subject = email1 ? resolveDraftSubject(email1) : "";

  const barNodes: BarNode[] = railDrafts.map((d, i) => {
    const pos = d.sequencePosition ?? i + 1;
    return {
      id: sequenceRailNodeId(pos),
      label: sequenceRailLabel(pos, cadencePair),
      state: pos === 1 ? ("current" as const) : ("upcoming" as const),
      kind: "draft" as const,
      outreachId: d.id,
      subject: pos === 1 ? email1Subject || (d.subjectA ?? undefined) : (d.subjectA ?? undefined),
      body: clip(d.emailBody),
      snippet: preview(d.emailBody),
    };
  });
  if (barNodes.length > 0) barNodes[0].state = "current";

  const prev = opts?.previous;
  return {
    // Always refresh from live Email 1 while rebuilding the drafts rail so Re: rows track subject edits.
    threadRootSubject: email1Subject || prev?.threadRootSubject || undefined,
    sequenceState: prev?.sequenceState ?? "not_started",
    phase: "compose",
    nextAction: "compose",
    nextStep: undefined,
    barMode: "drafts",
    barNodes,
    cadenceDays: cadencePair,
    selectedNodeId: barNodes.find((n) => n.state === "current")?.id ?? "draft-1",
    events: barNodes
      .filter((n) => n.id !== IF_OPENED_NODE_ID)
      .map((n) => ({
        id: n.id,
        kind: "draft" as const,
        label: n.label.replace(/\s\(\+\d+d\)$/, ""),
        subject: n.subject,
        snippet: n.snippet,
        body: n.body,
        status: "draft" as const,
      })),
    inboundSnippet: prev?.inboundSnippet,
    showComposeZone: true,
  };
}

export type ThreadEventKind = "initial" | "followup" | "inbound_reply" | "outbound_reply" | "scheduled" | "draft";
export type ThreadEventStatus = "sent" | "scheduled" | "cancelled" | "draft" | "opened" | "bounced";

export type ThreadPhase =
  | "compose"
  | "outreached"
  | "awaiting_reply"
  | "they_replied"
  | "drafting_reply"
  | "reply_sent"
  | "complete";

export type BarMode = "hidden" | "drafts" | "sequence" | "reply";

export type BarNodeState = "done" | "current" | "upcoming" | "scheduled" | "paused" | "skipped";

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
  openedAt?: string;
  bouncedAt?: string;
  bounceType?: string;
  bounceReason?: string;
  recipientEmail?: string;
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
  openedAt?: string;
  bouncedAt?: string;
  bounceType?: string;
  bounceReason?: string;
  recipientEmail?: string;
  sequenceDay?: number;
};

export type EmailThread = {
  threadRootSubject?: string;
  /** Optional on the wire so older clients/API payloads still type-check. */
  sequenceState?: SequenceControlState;
  phase: ThreadPhase;
  nextAction: "send_reply" | "await_reply" | "followup_due" | "compose" | "complete";
  nextStep?: { title: string; description: string; primaryAction?: string };
  barMode: BarMode;
  barNodes: BarNode[];
  cadenceDays?: [number, number];
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

function bounceFields(row?: ScheduleRow | null): {
  bouncedAt?: string;
  bounceType?: string;
  bounceReason?: string;
  recipientEmail?: string;
} {
  if (!row?.bouncedAt) {
    return row?.recipientEmail ? { recipientEmail: row.recipientEmail } : {};
  }
  return {
    bouncedAt: row.bouncedAt.toISOString(),
    bounceType: row.bounceType ?? undefined,
    bounceReason: row.bounceReason ?? undefined,
    recipientEmail: row.recipientEmail ?? undefined,
  };
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

function eventLabelForRow(
  kind: ThreadEventKind,
  sequenceDay: number,
  cadenceDays: number[],
  emailKind?: string | null,
): string {
  if (emailKind === CATALOG_ON_OPEN_EMAIL_KIND) {
    return "If Opened";
  }
  if (kind === "inbound_reply") return "Their reply";
  if (kind === "outbound_reply") return "Your reply";
  return emailStepLabel(sequenceDay, normalizeCadenceDays(cadenceDays));
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
    const openedAt = row.openedAt?.toISOString();
    const bounce = bounceFields(row);
    events.push({
      id: row.id,
      kind: isScheduled ? "scheduled" : kind,
      label: eventLabelForRow(kind, row.sequenceDay, cadenceDays, row.emailKind),
      subject: row.subjectSent ?? undefined,
      snippet: kind === "inbound_reply" ? preview(lead.lastReplyContent) : preview(body),
      body: kind === "inbound_reply" ? clip(lead.lastReplyContent) : clip(body),
      at: (row.sentAt ?? (isScheduled ? row.scheduledFor : undefined))?.toISOString(),
      status: bounce.bouncedAt ? "bounced" : openedAt ? "opened" : isScheduled ? "scheduled" : "sent",
      openedAt,
      sequenceDay: row.sequenceDay,
      ...bounce,
    });
  }

  const hasInboundRow = scheduleRows.some((r) => r.emailKind === "inbound_reply" || r.sequenceDay === -2);
  const hasInbound = hasInboundRow || lead.status === "replied" || Boolean(lead.lastReplyContent);
  const hasOutboundReply = scheduleRows.some((r) => r.emailKind === "outbound_reply" || r.sequenceDay === -1);
  const initialSent = scheduleRows.some((r) => r.status === "sent" && (r.sequenceDay === 0 || r.emailKind === "initial"));
  const pendingFollowup = scheduleRows.some((r) => r.status === "scheduled" && r.sequenceDay > 0);
  const sequenceState = deriveSequenceState(lead.status, scheduleRows);
  const isReplyDraft = latestOutreach?.templateVariant === "reply";

  if (hasInbound && !hasInboundRow) {
    events.push({
      id: `inbound-synth-${lead.id}`,
      kind: "inbound_reply",
      label: "Their reply",
      snippet: preview(lead.lastReplyContent),
      body: clip(lead.lastReplyContent),
      at: inboundReplyAt ?? undefined,
      status: "sent",
      sequenceDay: -2,
    });
  }

  const coveredPositions = new Set<number>();
  for (const ev of events) {
    if (ev.kind === "inbound_reply" || ev.kind === "outbound_reply") continue;
    if (ev.label === "If Opened") continue;
    if (ev.sequenceDay === 0) coveredPositions.add(1);
    else if (ev.sequenceDay === cadenceDays[0]) coveredPositions.add(2);
    else if (ev.sequenceDay === cadenceDays[1]) coveredPositions.add(3);
  }

  for (const d of [...sequenceDrafts].sort((a, b) => (a.sequencePosition ?? 99) - (b.sequencePosition ?? 99))) {
    const pos = d.sequencePosition ?? 1;
    if (pos < 1 || pos > 3) continue;
    if (coveredPositions.has(pos)) continue;
    events.push({
      id: sequenceRailNodeId(pos),
      kind: "draft",
      label: `Email ${pos}`,
      subject: resolveDraftSubject(d) || undefined,
      snippet: preview(d.emailBody),
      body: clip(d.emailBody),
      status: "draft",
      sequenceDay: pos === 1 ? 0 : cadenceDays[pos - 2] ?? pos,
    });
  }

  if (isReplyDraft && !replyDraftSent && !hasOutboundReply) {
    events.push({
      id: "reply-draft",
      kind: "draft",
      label: "Your reply",
      subject: latestOutreach?.subjectA ?? undefined,
      snippet: preview(latestOutreach?.emailBody),
      body: clip(latestOutreach?.emailBody),
      status: "draft",
      sequenceDay: -1,
    });
  }

  const email1Draft =
    sequenceDrafts.find((d) => d.sequencePosition === 1) ??
    (latestOutreach?.sequencePosition === 1 ? latestOutreach : undefined);
  const email1Subject = email1Draft ? resolveDraftSubject(email1Draft) : "";
  const threadRootSubject =
    lead.threadRootSubject ??
    sorted.find((r) => r.sequenceDay === 0)?.subjectSent ??
    (email1Subject || (latestOutreach ? resolveDraftSubject(latestOutreach) : undefined) || undefined);

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

  const bouncedSent = scheduleRows.find((r) => r.bouncedAt && r.status === "sent");
  const nextStep = bouncedSent
    ? {
        title: "Email bounced",
        description: bouncedSent.recipientEmail
          ? `${bouncedSent.recipientEmail} rejected this send. Follow-ups are paused until you use a working address.`
          : "This send bounced. Follow-ups are paused until you use a working address.",
        primaryAction: undefined,
      }
    : buildNextStep(phase, nextAction, pendingFollowup);

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

  let selectedNodeId =
    barNodes.find((n) => n.state === "current")?.id ?? barNodes[0]?.id;
  if (phase === "drafting_reply" || phase === "they_replied") {
    selectedNodeId = IF_REPLIED_NODE_ID;
  } else if (barMode === "drafts") {
    selectedNodeId = barNodes.find((n) => n.state === "current")?.id ?? "draft-1";
  }

  return {
    threadRootSubject: threadRootSubject ? normalizeReplySubject(threadRootSubject) : undefined,
    sequenceState,
    phase,
    nextAction,
    nextStep,
    barMode,
    barNodes,
    cadenceDays: [cadenceDays[0] ?? 3, cadenceDays[1] ?? 7],
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

  // Progress strip always shows Email 1–3 when the sequence has started or drafts exist.
  // Conversation history (including replies) lives in `events`, not this strip.
  if (initialSent || hasInbound || lead.status === "replied" || lead.status === "outreached") {
    const nodes: BarNode[] = [];
    const e1Row = scheduleRows.find((r) => r.sequenceDay === 0 && r.status === "sent");
    const e1Body = e1Row?.bodySnippet ?? (e1Row?.approvalId ? outreachBodiesByApprovalId[e1Row.approvalId] : undefined);
    nodes.push({
      id: "e1",
      label: "Email 1",
      state: e1Row ? "done" : "upcoming",
      kind: e1Row ? "sent" : "scheduled",
      scheduleId: e1Row?.id,
      subject: e1Row?.subjectSent ?? undefined,
      body: clip(e1Body),
      snippet: preview(e1Body),
      at: e1Row?.sentAt?.toISOString(),
      openedAt: e1Row?.openedAt?.toISOString(),
      ...bounceFields(e1Row),
    });

    const catalogDraft = sortedDrafts.find((d) => isCatalogOnOpenDraft(d));
    const followupSchedules = scheduleRows
      .filter((r) => r.sequenceDay > 0 && !isCatalogOnOpenSchedule(r, catalogDraft?.id))
      .sort((a, b) => a.sequenceDay - b.sequenceDay);

    const cadence = cadenceDays.length >= 2 ? cadenceDays : [3, 7];
    for (let i = 0; i < cadence.length; i++) {
      const day = cadence[i];
      const row = followupSchedules.find((r) => r.sequenceDay === day) ?? followupSchedules[i];
      const emailNum = i + 2;
      const isSent = row?.status === "sent";
      const isScheduled = row?.status === "scheduled";
      const isPaused = row?.status === "paused";
      const isCancelled = row?.status === "cancelled";
      const repliedStops = hasInbound || lead.status === "replied";
      const skipped = !isSent && (isCancelled || repliedStops);
      const body = row ? bodyForScheduleRow(row, outreachBodiesByApprovalId) : undefined;
      const days = row && isScheduled && !skipped ? daysUntil(row.scheduledFor) : undefined;
      const linkedDraft = sortedDrafts.find((d) => d.sequencePosition === emailNum);

      nodes.push({
        id: `e${emailNum}`,
        label: `Email ${emailNum}`,
        state: isSent
          ? "done"
          : skipped
            ? "skipped"
            : isPaused
              ? "paused"
              : isScheduled
                ? "scheduled"
                : "upcoming",
        kind: isSent ? "sent" : "scheduled",
        scheduleId: row?.id,
        outreachId: row?.draftLeadOutreachId ?? linkedDraft?.id,
        daysUntil: days,
        subject: row?.subjectSent ?? linkedDraft?.subjectA ?? undefined,
        body: clip(body ?? linkedDraft?.emailBody),
        snippet: preview(body ?? linkedDraft?.emailBody),
        at: row?.sentAt?.toISOString() ?? (isScheduled ? row?.scheduledFor?.toISOString() : undefined),
        openedAt: row?.openedAt?.toISOString(),
        ...bounceFields(row),
      });
    }

    const catalogSched = scheduleRows.find((r) => isCatalogOnOpenSchedule(r, catalogDraft?.id));
    if (catalogDraft || catalogSched) {
      const isSent = catalogSched?.status === "sent";
      const isScheduled = catalogSched?.status === "scheduled";
      const isPaused = catalogSched?.status === "paused";
      const isCancelled = catalogSched?.status === "cancelled";
      const repliedStops = hasInbound || lead.status === "replied";
      const skipped = !isSent && (isCancelled || repliedStops);
      const days =
        catalogSched && isScheduled && !skipped ? daysUntil(catalogSched.scheduledFor) : undefined;
      nodes.push({
        id: IF_OPENED_NODE_ID,
        label: "If Opened",
        state: isSent
          ? "done"
          : skipped
            ? "skipped"
            : isPaused
              ? "paused"
              : isScheduled
                ? "scheduled"
                : "upcoming",
        kind: isSent ? "sent" : isScheduled ? "scheduled" : "draft",
        scheduleId: catalogSched?.id,
        outreachId: catalogSched?.draftLeadOutreachId ?? catalogDraft?.id,
        daysUntil: days,
        subject: catalogSched?.subjectSent ?? catalogDraft?.subjectA ?? undefined,
        body: clip(
          catalogSched
            ? bodyForScheduleRow(catalogSched, outreachBodiesByApprovalId)
            : catalogDraft?.emailBody,
        ),
        snippet: preview(
          catalogSched
            ? bodyForScheduleRow(catalogSched, outreachBodiesByApprovalId)
            : catalogDraft?.emailBody,
        ),
        at:
          catalogSched?.sentAt?.toISOString() ??
          (isScheduled ? catalogSched?.scheduledFor?.toISOString() : undefined),
        openedAt: catalogSched?.openedAt?.toISOString(),
        ...bounceFields(catalogSched),
      });
    }

    // Keep barMode "reply" when they replied so compose wiring can detect reply flows,
    // but the strip still shows Email 1-3 progress plus If Opened.
    if (hasInbound || lead.status === "replied") {
      return { barMode: "reply", barNodes: nodes };
    }

    return { barMode: "sequence", barNodes: nodes };
  }

  if (sortedDrafts.length > 0) {
    const cadencePair: [number, number] = [
      cadenceDays[0] ?? 3,
      cadenceDays[1] ?? 7,
    ];
    const railDrafts = sortedDrafts.filter((d) => isSequenceRailPosition(d.sequencePosition));
    const nodes: BarNode[] = railDrafts.map((d, i) => {
      const pos = d.sequencePosition ?? i + 1;
      return {
        id: sequenceRailNodeId(pos),
        label: sequenceRailLabel(pos, cadencePair),
        state: pos === 1 ? ("current" as const) : ("upcoming" as const),
        kind: "draft" as const,
        outreachId: d.id,
        subject: d.subjectA ?? undefined,
        body: clip(d.emailBody),
        snippet: preview(d.emailBody),
      };
    });
    if (nodes.length > 0) nodes[0].state = "current";
    return { barMode: "drafts", barNodes: nodes };
  }

  void latestOutreach;
  void isReplyDraft;
  void replyDraftSent;
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
      return undefined;
    case "awaiting_reply":
      return pendingFollowup
        ? {
            title: "Awaiting their reply",
            description: "Email 1 is sent. Follow-ups are scheduled.",
            primaryAction: undefined,
          }
        : {
            title: "Sequence paused or complete",
            description: "Email 1 is sent. Resume or cancel follow-ups from the controls above.",
            primaryAction: undefined,
          };
    case "they_replied":
      return {
        title: "They replied",
        description: "Write your reply in the empty body, or use Write smart reply.",
        primaryAction: "Open reply",
      };
    case "drafting_reply":
      return {
        title: "Send your reply",
        description: "Empty body ready. Write your reply and send in thread.",
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

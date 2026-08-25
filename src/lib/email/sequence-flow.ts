import type { BarNode, BarNodeState, EmailThread } from "@/lib/email/email-thread";
import { IF_OPENED_NODE_ID, isIshFestiveCatalogBody } from "@/lib/email/ish-festive-catalog";
import { IF_REPLIED_NODE_ID } from "@/lib/email/blank-reply-constants";

export type SequenceFlowMode = "plan" | "waiting" | "catalog" | "replied";

export type SequenceFlowVariant = "none" | "sample" | "catalog";

export type SequenceFlowSlot = 1 | 2 | 3 | "opened" | "replied";

export type SequenceFlowNode = {
  id: string;
  slot: SequenceFlowSlot;
  emailNum?: 1 | 2 | 3;
  label: string;
  state: BarNodeState;
  opened: boolean;
  variant: SequenceFlowVariant;
  cadenceLabel?: string;
  title: string;
};

export type SequenceFlowModel = {
  mode: SequenceFlowMode;
  catalogActive: boolean;
  replyActive: boolean;
  catalogQueuedFor: 2 | 3 | null;
  level2Visible: boolean;
  nodes: SequenceFlowNode[];
};

const DEFAULT_CADENCE: [number, number] = [3, 7];

function cadencePair(thread?: EmailThread | null): [number, number] {
  const days = thread?.cadenceDays;
  if (days && days.length >= 2) return [days[0] ?? 3, days[1] ?? 7];
  return DEFAULT_CADENCE;
}

function cadenceEdgeLabel(days: number): string {
  return `+${days}d`;
}

function slotFromNode(node: BarNode, index: number): SequenceFlowSlot {
  if (node.id === IF_OPENED_NODE_ID || node.label === "If Opened") return "opened";
  if (node.id === IF_REPLIED_NODE_ID || node.id === "reply-draft" || node.label === "If Replied") {
    return "replied";
  }
  const fromId = node.id.match(/(\d+)/);
  const n = fromId ? Number(fromId[1]) : index + 1;
  if (n === 2) return 2;
  if (n === 3) return 3;
  if (n === 5) return "opened";
  if (n === 4) return "replied";
  return 1;
}

function variantForFollowUp(body?: string | null): SequenceFlowVariant {
  if (!body) return "sample";
  return isIshFestiveCatalogBody(body) ? "catalog" : "sample";
}

function nodeTitle(params: {
  slot: SequenceFlowSlot;
  state: BarNodeState;
  opened: boolean;
  variant: SequenceFlowVariant;
  cadenceLabel?: string;
}): string {
  const { slot, state, opened, variant, cadenceLabel } = params;
  if (slot === "opened") {
    if (state === "scheduled" && cadenceLabel) {
      return `If Opened catalogue scheduled ${cadenceLabel}.`;
    }
    if (state === "done") return "If Opened catalogue sent.";
    if (state === "skipped") return "If Opened skipped. Sequence stopped after a reply.";
    return "If they open Email 1 or 2, this catalogue sends the next send day. Edit either option.";
  }
  if (slot === "replied") {
    if (state === "done") return "Your reply was sent.";
    return "They replied. Open an empty reply body and write your response.";
  }
  if (state === "skipped") return `Email ${slot} skipped. Sequence stopped after a reply.`;
  if (opened) return `Email ${slot} opened.`;
  if (state === "done") return `Email ${slot} sent.`;
  if (state === "scheduled" && cadenceLabel) return `Email ${slot} scheduled ${cadenceLabel}.`;
  if (slot === 2) return "Email 2 stays the short sample draft.";
  if (slot === 3) return "Email 3 stays the short breakup draft.";
  return `Email ${slot}`;
}

function syntheticPlanNodes(cadence: [number, number]): SequenceFlowNode[] {
  return [
    {
      id: "draft-1",
      slot: 1,
      emailNum: 1,
      label: "Email 1",
      state: "upcoming",
      opened: false,
      variant: "none",
      title: "Email 1. The sequence starts here.",
    },
    {
      id: "draft-2",
      slot: 2,
      emailNum: 2,
      label: "Email 2",
      state: "upcoming",
      opened: false,
      variant: "sample",
      cadenceLabel: cadenceEdgeLabel(cadence[0]),
      title: "Email 2 stays the short sample draft.",
    },
    {
      id: "draft-3",
      slot: 3,
      emailNum: 3,
      label: "Email 3",
      state: "upcoming",
      opened: false,
      variant: "sample",
      cadenceLabel: cadenceEdgeLabel(cadence[1]),
      title: "Email 3 stays the short breakup draft.",
    },
    {
      id: IF_OPENED_NODE_ID,
      slot: "opened",
      label: "If Opened",
      state: "upcoming",
      opened: false,
      variant: "catalog",
      title: "If they open Email 1 or 2, this catalogue sends the next send day.",
    },
    // If Replied is omitted until an inbound reply (see buildSequenceFlow).
  ];
}

function ifOpenedNode(thread?: EmailThread | null): SequenceFlowNode {
  const fromBar = thread?.barNodes.find((n) => n.id === IF_OPENED_NODE_ID || n.label === "If Opened");
  const state = fromBar?.state ?? "upcoming";
  const cadenceLabel =
    state === "done"
      ? "Sent"
      : state === "scheduled"
        ? "Queued"
        : state === "paused"
          ? "Paused"
          : undefined;
  const pathActive = state === "scheduled" || state === "done" || state === "paused";
  return {
    id: fromBar?.id ?? IF_OPENED_NODE_ID,
    slot: "opened",
    label: "If Opened",
    state,
    opened: pathActive || Boolean(fromBar?.openedAt),
    variant: "catalog",
    cadenceLabel,
    title: nodeTitle({
      slot: "opened",
      state,
      opened: Boolean(fromBar?.openedAt),
      variant: "catalog",
      cadenceLabel: state === "scheduled" ? "next send day" : undefined,
    }),
  };
}

function ifRepliedNode(thread?: EmailThread | null): SequenceFlowNode {
  const hasReplyDraft = Boolean(
    thread?.events.some((e) => e.id === "reply-draft") ||
      thread?.phase === "drafting_reply" ||
      thread?.phase === "reply_sent",
  );
  const state: BarNodeState =
    thread?.phase === "reply_sent" ? "done" : hasReplyDraft ? "current" : "upcoming";
  return {
    id: IF_REPLIED_NODE_ID,
    slot: "replied",
    label: "Reply",
    state,
    opened: false,
    variant: "none",
    cadenceLabel: state === "done" ? "Sent" : "Write",
    title: nodeTitle({ slot: "replied", state, opened: false, variant: "none" }),
  };
}

export function buildSequenceFlow(thread?: EmailThread | null): SequenceFlowModel {
  const cadence = cadencePair(thread);
  const replied =
    thread?.barMode === "reply" ||
    thread?.phase === "they_replied" ||
    thread?.phase === "drafting_reply" ||
    thread?.phase === "reply_sent";

  if (!thread || thread.barMode === "hidden" || thread.barNodes.length === 0) {
    return {
      mode: "plan",
      catalogActive: false,
      replyActive: false,
      catalogQueuedFor: null,
      level2Visible: false,
      nodes: syntheticPlanNodes(cadence),
    };
  }

  const emailNodes = thread.barNodes
    .filter((n) => {
      const slot = slotFromNode(n, 0);
      return slot !== "opened" && slot !== "replied";
    })
    .slice(0, 3);
  while (emailNodes.length < 3) {
    const n = (emailNodes.length + 1) as 1 | 2 | 3;
    emailNodes.push({
      id: `e${n}`,
      label: `Email ${n}`,
      state: replied ? "skipped" : "upcoming",
      kind: "scheduled",
    });
  }

  const e1Opened = Boolean(emailNodes[0]?.openedAt);
  const e2Opened = Boolean(emailNodes[1]?.openedAt);
  const openedNode = ifOpenedNode(thread);
  const catalogActive =
    openedNode.state === "scheduled" || openedNode.state === "done" || openedNode.state === "paused";

  let mode: SequenceFlowMode = "plan";
  if (replied) mode = "replied";
  else if (catalogActive) mode = "catalog";
  else if (emailNodes[0]?.state === "done" && !e1Opened) mode = "waiting";
  else if (thread.barMode === "drafts") mode = "plan";

  const nodes: SequenceFlowNode[] = emailNodes.map((node, index) => {
    const slot = slotFromNode(node, index);
    const emailNum = slot === "opened" || slot === "replied" ? undefined : slot;
    const variant: SequenceFlowVariant = emailNum === 1 ? "none" : variantForFollowUp(node.body);
    const cadenceLabel = emailNum === 2 ? cadenceEdgeLabel(cadence[0]) : emailNum === 3 ? cadenceEdgeLabel(cadence[1]) : undefined;
    return {
      id: node.id,
      slot,
      emailNum,
      label: emailNum === 1 ? "Email 1" : emailNum === 2 ? "Email 2" : "Email 3",
      state: node.state,
      opened: Boolean(node.openedAt),
      variant,
      cadenceLabel,
      title: nodeTitle({
        slot,
        state: node.state,
        opened: Boolean(node.openedAt),
        variant,
        cadenceLabel,
      }),
    };
  });

  const hasIfOpenedBar = thread.barNodes.some((n) => n.id === IF_OPENED_NODE_ID || n.label === "If Opened");
  if (!replied || hasIfOpenedBar) {
    nodes.push(openedNode);
  }

  // Only surface the reply entry after an inbound reply / replied status.
  if (replied) {
    nodes.push(ifRepliedNode(thread));
  }

  return {
    mode,
    catalogActive,
    replyActive: Boolean(replied),
    catalogQueuedFor: null,
    level2Visible: Boolean(replied) || Boolean(e1Opened || e2Opened) || catalogActive,
    nodes,
  };
}

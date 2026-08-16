import { getVerticalPack } from "@/vertical-packs";
import type { VerticalPackId } from "@/vertical-packs/types";

export const PIPELINE_STAGES = [
  "Contact Ready",
  "Email",
  "Email Sent",
  "Replied",
  "Meeting",
  "Negotiate",
  "Closed",
] as const;

export type PipelineStageLabel = string;

export const MANUAL_STATUSES = ["tasting_sent", "negotiate", "closed"] as const;
export type ManualStatus = (typeof MANUAL_STATUSES)[number];

const STATUS_TO_PIPELINE_INDEX: Record<string, number> = {
  scouted: 0,
  prefiltered: 0,
  researched: 0,
  draft_ready: 1,
  approved: 1,
  outreached: 2,
  replied: 3,
  tasting_sent: 4,
  negotiate: 5,
  closed: 6,
  meeting: 5,
  po_closed: 6,
};

const MANUAL_TRANSITIONS: Record<string, ManualStatus> = {
  replied: "tasting_sent",
  tasting_sent: "negotiate",
  negotiate: "closed",
};

const ACCENTS_BY_INDEX = ["blue", "yellow", "yellow", "salmon", "yellow", "salmon", "muted"] as const;

export function pipelineStageLabels(packId?: VerticalPackId | string | null): string[] {
  return [...getVerticalPack(packId).pipelineLabels.stages];
}

export function statusToPipelineIndex(status: string): number {
  return STATUS_TO_PIPELINE_INDEX[status] ?? 0;
}

export function groupLeadsByPipelineStage<T extends { status: string; score?: number | null }>(
  leads: T[],
  packId?: VerticalPackId | string | null,
): Record<string, T[]> {
  const stages = pipelineStageLabels(packId);
  const groups = Object.fromEntries(stages.map((stage) => [stage, [] as T[]])) as Record<string, T[]>;

  for (const lead of leads) {
    const stage = stages[statusToPipelineIndex(lead.status)] ?? stages[0];
    groups[stage].push(lead);
  }

  for (const stage of stages) {
    groups[stage].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  }

  return groups;
}

export const PIPELINE_STAGE_ACCENTS: Record<string, (typeof ACCENTS_BY_INDEX)[number]> = {
  "Contact Ready": "blue",
  Email: "yellow",
  "Email Sent": "yellow",
  Replied: "salmon",
  Meeting: "yellow",
  "Tasting Sent": "yellow",
  "Sample Sent": "yellow",
  Negotiate: "salmon",
  Closed: "muted",
};

export type PipelineStageAccent = (typeof ACCENTS_BY_INDEX)[number];

export function statusToDisplayLabel(status: string, packId?: VerticalPackId | string | null): string {
  const stages = pipelineStageLabels(packId);
  const index = STATUS_TO_PIPELINE_INDEX[status];
  if (index != null) return stages[index] ?? status.replace(/_/g, " ");
  return status.replace(/_/g, " ");
}

export function isManualStage(status: string): boolean {
  return (MANUAL_STATUSES as readonly string[]).includes(status);
}

export function isPastReplyStage(status: string): boolean {
  return isManualStage(status) || status === "closed" || status === "po_closed";
}

export function canManuallyAdvance(from: string, to: string): boolean {
  return MANUAL_TRANSITIONS[from] === to;
}

export function getNextManualStatus(status: string): ManualStatus | null {
  const next = MANUAL_TRANSITIONS[status];
  return next ?? null;
}

export function isContactReadyStage(status: string): boolean {
  return ["scouted", "prefiltered", "researched"].includes(status);
}

export function isEmailOutreachStarted(status: string, hasDraft: boolean): boolean {
  if (hasDraft) return true;
  return isEmailStage(status) || status === "replied" || isPastReplyStage(status);
}

export function isEmailStage(status: string): boolean {
  return ["draft_ready", "approved", "outreached"].includes(status);
}

/** Statuses that still expect a prospect reply. */
export const REPLY_WATCH_STATUSES = ["outreached", "approved"] as const;

export function isReplyWatchStatus(status: string): boolean {
  return (REPLY_WATCH_STATUSES as readonly string[]).includes(status);
}

export function deriveQueueAction(status: string, packId?: VerticalPackId | string | null): string {
  switch (status) {
    case "scouted":
    case "prefiltered":
      return "Awaiting research";
    case "researched":
      return "Ready for outreach";
    case "draft_ready":
      return "Approve email";
    case "approved":
      return "Send email";
    case "outreached":
      return "Follow-up";
    case "replied":
      return getVerticalPack(packId).pipelineLabels.markPostReplyAction;
    case "tasting_sent":
      return "Move to negotiate";
    case "negotiate":
      return "Close deal";
    case "closed":
    case "po_closed":
      return "Deal closed";
    case "meeting":
      return "Meeting booked";
    default:
      return "Review";
  }
}

export function parseDealAmount(amount: string): number | null {
  const digits = amount.replace(/[^\d.]/g, "");
  if (!digits) return null;
  const value = parseFloat(digits);
  return Number.isFinite(value) && value > 0 ? value : null;
}

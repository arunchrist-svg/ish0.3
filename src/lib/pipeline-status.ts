export const PIPELINE_STAGES = [
  "Contact Ready",
  "Email",
  "Open",
  "Tasting Sent",
  "Negotiate",
  "Closed",
] as const;

export type PipelineStageLabel = (typeof PIPELINE_STAGES)[number];

export const MANUAL_STATUSES = ["tasting_sent", "negotiate", "closed"] as const;
export type ManualStatus = (typeof MANUAL_STATUSES)[number];

const STATUS_TO_PIPELINE_INDEX: Record<string, number> = {
  scouted: 0,
  prefiltered: 0,
  researched: 0,
  draft_ready: 1,
  approved: 1,
  outreached: 1,
  replied: 2,
  tasting_sent: 3,
  negotiate: 4,
  closed: 5,
  meeting: 4,
  po_closed: 5,
};

const STATUS_TO_DISPLAY_LABEL: Record<string, string> = {
  scouted: "Contact Ready",
  prefiltered: "Contact Ready",
  researched: "Contact Ready",
  draft_ready: "Email",
  approved: "Email",
  outreached: "Email",
  replied: "Open",
  tasting_sent: "Tasting Sent",
  negotiate: "Negotiate",
  closed: "Closed",
  meeting: "Negotiate",
  po_closed: "Closed",
};

const MANUAL_TRANSITIONS: Record<string, ManualStatus> = {
  replied: "tasting_sent",
  tasting_sent: "negotiate",
  negotiate: "closed",
};

export function statusToPipelineIndex(status: string): number {
  return STATUS_TO_PIPELINE_INDEX[status] ?? 0;
}

export function statusToDisplayLabel(status: string): string {
  return STATUS_TO_DISPLAY_LABEL[status] ?? status.replace(/_/g, " ");
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

export function isEmailStage(status: string): boolean {
  return ["draft_ready", "approved", "outreached"].includes(status);
}

export function deriveQueueAction(status: string): string {
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
      return "Mark tasting sent";
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

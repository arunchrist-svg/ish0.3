/**
 * Client-safe sequence helpers (no DB / Node imports).
 * Keep DB-backed control in `sequence-control.ts`.
 */

export type SequenceControlState = "not_started" | "active" | "paused" | "cancelled" | "complete";
export type SequenceAction = "start" | "pause" | "cancel" | "reset";

type ScheduleRow = { sequenceDay: number; status: string };

const PENDING_FOLLOWUP = ["scheduled", "paused", "pending_review"] as const;

export function deriveSequenceState(leadStatus: string, scheduleRows: ScheduleRow[]): SequenceControlState {
  if (["replied", "meeting", "tasting_sent", "negotiate", "closed", "po_closed"].includes(leadStatus)) {
    return "complete";
  }

  const initialSent = scheduleRows.some((r) => r.sequenceDay === 0 && r.status === "sent");
  const followups = scheduleRows.filter((r) => r.sequenceDay > 0);

  if (!initialSent) return "not_started";
  if (followups.some((r) => r.status === "scheduled" || r.status === "pending_review")) return "active";
  if (followups.some((r) => r.status === "paused")) return "paused";

  const pending = followups.filter((r) => PENDING_FOLLOWUP.includes(r.status as (typeof PENDING_FOLLOWUP)[number]));
  if (pending.length === 0 && followups.some((r) => r.status === "cancelled")) return "cancelled";

  return "complete";
}

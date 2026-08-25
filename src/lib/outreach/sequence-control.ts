import { db, leads, outreachSchedule } from "@/db";
import { eq, inArray } from "drizzle-orm";
import { logAudit } from "@/lib/audit";
import { resetLeadOutreach } from "@/lib/outreach/reset-lead-outreach";
import {
  deriveSequenceState,
  type SequenceAction,
  type SequenceControlState,
} from "@/lib/outreach/sequence-control-shared";

export type { SequenceAction, SequenceControlState };
export { deriveSequenceState };

export async function controlLeadSequence(params: {
  leadId: string;
  action: SequenceAction;
  tenantId: string;
  workspaceId: string;
}): Promise<{ ok: true; state: SequenceControlState; updated: number } | { ok: false; error: string }> {
  const { leadId, action, tenantId, workspaceId } = params;

  const lead = await db.query.leads.findFirst({ where: eq(leads.id, leadId) });
  if (!lead || lead.tenantId !== tenantId || lead.workspaceId !== workspaceId) {
    return { ok: false, error: "Lead not found" };
  }

  const rows = await db
    .select({ id: outreachSchedule.id, sequenceDay: outreachSchedule.sequenceDay, status: outreachSchedule.status })
    .from(outreachSchedule)
    .where(eq(outreachSchedule.leadId, leadId));

  const state = deriveSequenceState(lead.status, rows);
  const followupIds = (statuses: string[]) =>
    rows.filter((r) => r.sequenceDay > 0 && statuses.includes(r.status)).map((r) => r.id);

  let updated = 0;
  let nextState: SequenceControlState = state;

  if (action === "reset") {
    await resetLeadOutreach(leadId);
    updated = rows.length;
    const refreshed = await db.query.leads.findFirst({ where: eq(leads.id, leadId) });
    const remaining = await db
      .select({ sequenceDay: outreachSchedule.sequenceDay, status: outreachSchedule.status })
      .from(outreachSchedule)
      .where(eq(outreachSchedule.leadId, leadId));
    nextState = deriveSequenceState(refreshed?.status ?? "researched", remaining);
  } else if (action === "start") {
    if (state === "not_started") {
      return { ok: false, error: "Send Email 1 first to start the sequence" };
    }
    if (state === "complete" || state === "cancelled") {
      return { ok: false, error: "Sequence is no longer active" };
    }
    const ids = followupIds(["paused"]);
    if (ids.length === 0) {
      return { ok: false, error: "No paused follow-ups to resume" };
    }
    await db.update(outreachSchedule).set({ status: "scheduled" }).where(inArray(outreachSchedule.id, ids));
    updated = ids.length;
    nextState = "active";
  } else if (action === "pause") {
    if (state !== "active") {
      return { ok: false, error: "Sequence is not running" };
    }
    const ids = followupIds(["scheduled", "pending_review"]);
    if (ids.length === 0) {
      return { ok: false, error: "No scheduled follow-ups to pause" };
    }
    await db.update(outreachSchedule).set({ status: "paused" }).where(inArray(outreachSchedule.id, ids));
    updated = ids.length;
    nextState = "paused";
  } else if (action === "cancel") {
    if (state === "not_started" || state === "complete") {
      return { ok: false, error: "Nothing to cancel" };
    }
    const ids = followupIds(["scheduled", "paused", "pending_review"]);
    if (ids.length === 0) {
      return { ok: false, error: "No pending follow-ups to cancel" };
    }
    await db.update(outreachSchedule).set({ status: "cancelled" }).where(inArray(outreachSchedule.id, ids));
    updated = ids.length;
    nextState = "cancelled";
  }

  await logAudit({
    tenantId,
    workspaceId,
    action: `sequence.${action}`,
    entityType: "lead",
    entityId: leadId,
    metadata: { updated, previousState: state, nextState },
  });

  return { ok: true, state: nextState, updated };
}

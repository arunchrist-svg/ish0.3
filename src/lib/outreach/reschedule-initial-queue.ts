import { db, leads, outreachSchedule } from "@/db";
import { and, asc, eq, gt, inArray, lte } from "drizzle-orm";
import { getResolvedEmailConfig } from "@/lib/settings/email-settings";
import {
  formatQueuedSendLabel,
  isWithinSendWindow,
  nextSendWindowStart,
  scheduleAnchorOnCalendarDay,
  sendWindowFromEmailFields,
} from "@/lib/email/send-window";
import { recommendedDailyCap } from "@/lib/email/sender-warmup";
import { countSentInitialByCalendarDay } from "@/lib/email/sender-volume";
import { isOutreachSendingPaused, OUTREACH_PAUSED_MESSAGE } from "@/lib/email/config";
import { BATCH_SEND_GAP_MINUTES, planBatchInitialSends } from "@/lib/outreach/plan-batch-sends";
import { calendarDayKey } from "@/lib/email/send-window-parts";
import { logAudit } from "@/lib/audit";
import type { TenantContext } from "@/lib/tenant";
import type { BatchSendPlan } from "@/lib/outreach/batch-send-initial";

export type RescheduleQueueResult = {
  rescheduled: number;
  leadCount: number;
  scheduleFrom: string;
  scheduleFromLabel: string;
  plan: BatchSendPlan;
  sendsByDay: { day: string; count: number }[];
};

type QueueActor = {
  tenantId: string;
  workspaceId: string;
  userId?: string | null;
};

async function countFutureQueuedByDay(workspaceId: string, timezone: string, after: Date) {
  const rows = await db
    .select({ scheduledFor: outreachSchedule.scheduledFor })
    .from(outreachSchedule)
    .innerJoin(leads, eq(outreachSchedule.leadId, leads.id))
    .where(
      and(
        eq(leads.workspaceId, workspaceId),
        eq(outreachSchedule.channel, "email"),
        eq(outreachSchedule.sequenceDay, 0),
        inArray(outreachSchedule.status, ["scheduled", "sending", "paused"]),
        gt(outreachSchedule.scheduledFor, after),
      ),
    );
  const byDay = new Map<string, number>();
  for (const row of rows) {
    const key = calendarDayKey(row.scheduledFor, timezone);
    byDay.set(key, (byDay.get(key) ?? 0) + 1);
  }
  return byDay;
}

function mergeDayCounts(a: Map<string, number>, b: Map<string, number>) {
  const out = new Map(a);
  for (const [key, n] of b) {
    out.set(key, (out.get(key) ?? 0) + n);
  }
  return out;
}

async function applySlots(rows: { id: string; leadId: string }[], slotByLead: Map<string, Date>) {
  const CHUNK = 80;
  let updated = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    await Promise.all(
      chunk.map(async (row) => {
        const slot = slotByLead.get(row.leadId);
        if (!slot) return;
        await db
          .update(outreachSchedule)
          .set({
            scheduledFor: slot,
            status: "scheduled",
            lastError: null,
            lastAttemptAt: null,
          })
          .where(eq(outreachSchedule.id, row.id));
        updated++;
      }),
    );
  }
  return updated;
}

async function replanQueuedRows(params: {
  actor: QueueActor;
  rows: { id: string; leadId: string }[];
  scheduleFrom: Date;
  now: Date;
  existingByDay: Map<string, number>;
  auditAction: string;
}): Promise<RescheduleQueueResult> {
  const emailConfig = await getResolvedEmailConfig(params.actor.workspaceId, params.actor.userId ?? undefined);
  const sendWindow = sendWindowFromEmailFields(emailConfig);
  const rec = recommendedDailyCap({
    stage: emailConfig.inboxWarmupStage,
    warmupStartedAt: emailConfig.inboxWarmupStartedAt,
  });
  const dailyCap = emailConfig.dailySendCapPerDomain ?? rec.recommended;

  const leadOrder: string[] = [];
  const seen = new Set<string>();
  for (const row of params.rows) {
    if (seen.has(row.leadId)) continue;
    seen.add(row.leadId);
    leadOrder.push(row.leadId);
  }

  const { slots, spanDays } = planBatchInitialSends({
    count: leadOrder.length,
    window: sendWindow,
    dailyCap,
    now: params.now,
    existingByDay: params.existingByDay,
    gapMinutes: BATCH_SEND_GAP_MINUTES,
    scheduleFrom: params.scheduleFrom,
  });

  const slotByLead = new Map<string, Date>();
  leadOrder.forEach((leadId, index) => {
    slotByLead.set(leadId, slots[index]!);
  });

  const updated = await applySlots(params.rows, slotByLead);

  const dayCounts = new Map<string, number>();
  for (const slot of slots) {
    const key = calendarDayKey(slot, sendWindow.timezone);
    dayCounts.set(key, (dayCounts.get(key) ?? 0) + 1);
  }

  const plan: BatchSendPlan = {
    dailyCap,
    timezone: sendWindow.timezone,
    spanDays,
    firstAt: slots[0]?.toISOString() ?? null,
    lastAt: slots[slots.length - 1]?.toISOString() ?? null,
  };

  await logAudit({
    tenantId: params.actor.tenantId,
    workspaceId: params.actor.workspaceId,
    actorId: params.actor.userId ?? undefined,
    action: params.auditAction,
    entityType: "workspace",
    entityId: params.actor.workspaceId,
    metadata: {
      rescheduled: updated,
      leadCount: leadOrder.length,
      scheduleFrom: params.scheduleFrom.toISOString(),
      plan,
      sendsByDay: [...dayCounts.entries()].map(([day, count]) => ({ day, count })),
    },
  });

  return {
    rescheduled: updated,
    leadCount: leadOrder.length,
    scheduleFrom: params.scheduleFrom.toISOString(),
    scheduleFromLabel: formatQueuedSendLabel(params.scheduleFrom, sendWindow),
    plan,
    sendsByDay: [...dayCounts.entries()].map(([day, count]) => ({ day, count })),
  };
}

/**
 * If Email 1 rows are due but we are outside the settings send window, move them
 * to the next allowed slot (spaced, daily cap). Returns null when in-window or nothing due.
 */
export async function rollDueInitialQueueIfOutsideWindow(
  actor: QueueActor,
  now = new Date(),
): Promise<RescheduleQueueResult | null> {
  const emailConfig = await getResolvedEmailConfig(actor.workspaceId, actor.userId ?? undefined);
  if (isOutreachSendingPaused(emailConfig)) return null;
  if (isWithinSendWindow(now, sendWindowFromEmailFields(emailConfig))) return null;

  const sendWindow = sendWindowFromEmailFields(emailConfig);
  const rows = await db
    .select({
      id: outreachSchedule.id,
      leadId: outreachSchedule.leadId,
    })
    .from(outreachSchedule)
    .innerJoin(leads, eq(outreachSchedule.leadId, leads.id))
    .where(
      and(
        eq(leads.tenantId, actor.tenantId),
        eq(leads.workspaceId, actor.workspaceId),
        eq(outreachSchedule.channel, "email"),
        eq(outreachSchedule.sequenceDay, 0),
        inArray(outreachSchedule.status, ["scheduled", "sending"]),
        lte(outreachSchedule.scheduledFor, now),
      ),
    )
    .orderBy(asc(outreachSchedule.scheduledFor), asc(outreachSchedule.leadId));

  if (rows.length === 0) return null;

  const scheduleFrom = nextSendWindowStart(now, sendWindow);
  const existingByDay = mergeDayCounts(
    await countSentInitialByCalendarDay(actor.workspaceId, sendWindow.timezone),
    await countFutureQueuedByDay(actor.workspaceId, sendWindow.timezone, now),
  );

  return replanQueuedRows({
    actor,
    rows,
    scheduleFrom,
    now,
    existingByDay,
    auditAction: "outreach.queue_rolled_to_window",
  });
}

export async function rollAllDueQueuesOutsideWindow(now = new Date()): Promise<number> {
  const groups = await db
    .selectDistinct({
      tenantId: leads.tenantId,
      workspaceId: leads.workspaceId,
    })
    .from(outreachSchedule)
    .innerJoin(leads, eq(outreachSchedule.leadId, leads.id))
    .where(
      and(
        eq(outreachSchedule.channel, "email"),
        eq(outreachSchedule.sequenceDay, 0),
        inArray(outreachSchedule.status, ["scheduled", "sending"]),
        lte(outreachSchedule.scheduledFor, now),
      ),
    );

  const seen = new Set<string>();
  let rescheduled = 0;
  for (const group of groups) {
    const key = `${group.tenantId}:${group.workspaceId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const result = await rollDueInitialQueueIfOutsideWindow(group, now);
    if (result) rescheduled += result.rescheduled;
  }
  return rescheduled;
}

export async function rescheduleInitialEmailQueue(
  ctx: TenantContext,
  options?: {
    daysAhead?: number;
    localHour?: number;
  },
): Promise<RescheduleQueueResult> {
  const emailConfig = await getResolvedEmailConfig(ctx.workspaceId, ctx.userId);
  if (isOutreachSendingPaused(emailConfig)) {
    throw new Error(OUTREACH_PAUSED_MESSAGE);
  }

  const sendWindow = sendWindowFromEmailFields(emailConfig);
  const now = new Date();
  const scheduleFrom = scheduleAnchorOnCalendarDay(now, sendWindow, {
    daysAhead: options?.daysAhead ?? 1,
    localHour: options?.localHour,
  });

  const rows = await db
    .select({
      id: outreachSchedule.id,
      leadId: outreachSchedule.leadId,
    })
    .from(outreachSchedule)
    .innerJoin(leads, eq(outreachSchedule.leadId, leads.id))
    .where(
      and(
        eq(leads.tenantId, ctx.tenantId),
        eq(leads.workspaceId, ctx.workspaceId),
        eq(outreachSchedule.channel, "email"),
        eq(outreachSchedule.sequenceDay, 0),
        inArray(outreachSchedule.status, ["scheduled", "sending"]),
      ),
    )
    .orderBy(asc(outreachSchedule.scheduledFor), asc(outreachSchedule.leadId));

  if (rows.length === 0) {
    throw new Error("No queued Email 1 to reschedule");
  }

  return replanQueuedRows({
    actor: ctx,
    rows,
    scheduleFrom,
    now,
    existingByDay: await countSentInitialByCalendarDay(ctx.workspaceId, sendWindow.timezone),
    auditAction: "outreach.queue_rescheduled",
  });
}

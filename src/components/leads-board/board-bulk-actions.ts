import {
  fetchSendBatchProgress,
  runWriterSequence,
  sendBatchOutreach,
  type LeadQueueItem,
} from "@/lib/api-client";
import { sendWithGateConfirm } from "@/lib/outreach/send-with-gate-confirm";

export const MIN_SEND_GAP_MINUTES = 1;
export const MAX_SEND_GAP_MINUTES = 5;

export type BoardBulkProgress = {
  current: number;
  total: number;
  leadName?: string;
};

export type SendQueueStatus = "queued" | "waiting" | "sending" | "sent" | "failed" | "cancelled";

export type SendQueueItem = {
  leadId: string;
  name: string;
  status: SendQueueStatus;
  error?: string;
  /** Minutes to wait before this lead is sent. Present while status is waiting. */
  gapMinutes?: number;
  /** Epoch ms when a waiting send should start. Used to restore countdown after refresh. */
  waitUntil?: number;
};

export type BoardBulkResult = {
  ok: number;
  failed: number;
  cancelled: number;
  errors: string[];
  planSpanDays?: number;
  sequencer?: {
    processed: number;
    failed: number;
    skipped: number;
    pendingReview: number;
  };
};

export class SendCancelledError extends Error {
  constructor() {
    super("Send queue cancelled");
    this.name = "SendCancelledError";
  }
}

/** Whole number of minutes in [MIN_SEND_GAP_MINUTES, MAX_SEND_GAP_MINUTES]. */
export function randomGapMinutes(random: () => number = Math.random): number {
  const span = MAX_SEND_GAP_MINUTES - MIN_SEND_GAP_MINUTES + 1;
  const offset = Math.floor(random() * span);
  return MIN_SEND_GAP_MINUTES + Math.min(offset, span - 1);
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(new SendCancelledError());

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    function onAbort() {
      clearTimeout(timer);
      reject(new SendCancelledError());
    }

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export type WriteEmailsOptions = {
  outreachTemplate?: string;
  onProgress?: (progress: BoardBulkProgress) => void;
  signal?: AbortSignal;
};

export async function writeEmailsForLeads(
  leads: LeadQueueItem[],
  onProgressOrOptions?: ((progress: BoardBulkProgress) => void) | WriteEmailsOptions,
): Promise<BoardBulkResult> {
  const options: WriteEmailsOptions =
    typeof onProgressOrOptions === "function"
      ? { onProgress: onProgressOrOptions }
      : (onProgressOrOptions ?? {});
  const result: BoardBulkResult = { ok: 0, failed: 0, cancelled: 0, errors: [] };
  const total = leads.length;
  if (!total) return result;

  if (options.signal?.aborted) {
    result.cancelled = total;
    return result;
  }

  let completed = 0;
  const bumpProgress = (leadName?: string) => {
    completed += 1;
    options.onProgress?.({ current: completed, total, leadName });
  };

  await Promise.all(
    leads.map(async (lead) => {
      if (options.signal?.aborted) {
        result.cancelled += 1;
        return;
      }
      try {
        await runWriterSequence(lead.id, { outreachTemplate: options.outreachTemplate });
        result.ok += 1;
        bumpProgress(lead.name);
      } catch (e) {
        if (options.signal?.aborted) {
          result.cancelled += 1;
          return;
        }
        result.failed += 1;
        result.errors.push(
          `${lead.name}: ${e instanceof Error ? e.message : "Write failed"}`,
        );
        bumpProgress(lead.name);
      }
    }),
  );

  return result;
}

export type SendEmailsOptions = {
  signal?: AbortSignal;
  onQueueChange?: (queue: SendQueueItem[]) => void;
  /** @deprecated Batch send is planned server-side; kept for tests. */
  gapMinutes?: () => number;
  wait?: (ms: number, signal?: AbortSignal) => Promise<void>;
  isLeadCancelled?: (leadId: string) => boolean;
};

/**
 * Queues Email 1 for all leads via the batch planner: respects settings timezone,
 * send hours, daily cap per calendar day, and ~3 minute spacing within each day.
 */
export async function sendEmailsForLeads(
  leads: LeadQueueItem[],
  options?: SendEmailsOptions,
): Promise<BoardBulkResult> {
  const result: BoardBulkResult = { ok: 0, failed: 0, cancelled: 0, errors: [] };

  const queue: SendQueueItem[] = leads.map((lead) => ({
    leadId: lead.id,
    name: lead.name,
    status: "queued",
  }));

  function publish() {
    options?.onQueueChange?.(queue.map((item) => ({ ...item })));
  }

  publish();

  if (options?.signal?.aborted) {
    for (let i = 0; i < queue.length; i++) {
      queue[i] = { ...queue[i], status: "cancelled" };
      result.cancelled += 1;
    }
    publish();
    return result;
  }

  const activeIds = leads
    .filter((lead) => !options?.isLeadCancelled?.(lead.id))
    .map((lead) => lead.id);

  for (const item of queue) {
    if (options?.isLeadCancelled?.(item.leadId)) {
      item.status = "cancelled";
      result.cancelled += 1;
    } else {
      item.status = "sending";
    }
  }
  publish();

  if (activeIds.length === 0) {
    publish();
    return result;
  }

  try {
    const batchResult = await sendWithGateConfirm((overrides) =>
      sendBatchOutreach({ leadIds: activeIds, ...overrides }),
    );

    result.planSpanDays = batchResult.plan.spanDays;
    result.sequencer = batchResult.sequencer;

    const byLeadId = new Map(batchResult.results.map((r) => [r.leadId, r]));

    for (let i = 0; i < queue.length; i++) {
      const item = queue[i];
      if (item.status === "cancelled") continue;

      const row = byLeadId.get(item.leadId);
      if (row?.ok) {
        queue[i] = {
          ...item,
          status: "queued",
          waitUntil: row.scheduledFor ? new Date(row.scheduledFor).getTime() : undefined,
        };
        result.ok += 1;
      } else {
        const message = row?.error ?? "Send failed";
        queue[i] = { ...item, status: "failed", error: message };
        result.failed += 1;
        result.errors.push(`${item.name}: ${message}`);
      }
    }

    for (const err of batchResult.errors) {
      if (!result.errors.includes(err)) result.errors.push(err);
    }
  } catch (e) {
    if (options?.signal?.aborted) {
      for (let i = 0; i < queue.length; i++) {
        if (queue[i].status === "sending") {
          queue[i] = { ...queue[i], status: "cancelled" };
          result.cancelled += 1;
        }
      }
    } else {
      const message = e instanceof Error ? e.message : "Batch send failed";
      for (let i = 0; i < queue.length; i++) {
        if (queue[i].status === "sending") {
          queue[i] = { ...queue[i], status: "failed", error: message };
          result.failed += 1;
          result.errors.push(`${queue[i].name}: ${message}`);
        }
      }
    }
  }

  publish();
  return result;
}

export type SendEmailsForStageOptions = SendEmailsOptions & {
  processDue?: boolean;
  onProgress?: (completed: number, total: number) => void;
};

const SEND_BATCH_POLL_MS = 1500;
const SEND_BATCH_STALL_LIMIT = 120;

/**
 * Queues Email 1 for every lead in the given pipeline statuses (server resolves IDs).
 */
export async function sendEmailsForStage(
  params: { statuses: string[]; totalHint?: number },
  options?: SendEmailsForStageOptions,
): Promise<BoardBulkResult> {
  const result: BoardBulkResult = { ok: 0, failed: 0, cancelled: 0, errors: [] };
  const label =
    params.totalHint && params.totalHint > 0
      ? `${params.totalHint.toLocaleString()} leads`
      : "all leads in Email";

  const queue: SendQueueItem[] = [{ leadId: "__batch__", name: label, status: "sending" }];

  function publish() {
    options?.onQueueChange?.(queue.map((item) => ({ ...item })));
  }

  publish();

  if (options?.signal?.aborted) {
    queue[0] = { ...queue[0], status: "cancelled" };
    result.cancelled = 1;
    publish();
    return result;
  }

  try {
    const batchResult = await sendWithGateConfirm((overrides) =>
      sendBatchOutreach({
        statuses: params.statuses,
        processDue: options?.processDue,
        ...overrides,
      }),
    );

    result.planSpanDays = batchResult.plan.spanDays;

    if (
      batchResult.mode === "background" &&
      batchResult.startedAt &&
      batchResult.total &&
      batchResult.total > 0
    ) {
      const batchTotal = batchResult.total;
      let completed = 0;
      let lastCompleted = -1;
      let stallPolls = 0;

      while (!options?.signal?.aborted) {
        const progress = await fetchSendBatchProgress({
          statuses: params.statuses,
          startedAt: batchResult.startedAt,
          total: batchTotal,
        });
        completed = progress.completed;
        options?.onProgress?.(completed, batchTotal);
        queue[0] = {
          ...queue[0],
          name: `${completed.toLocaleString()} of ${batchTotal.toLocaleString()} scheduled`,
          status: "sending",
        };
        publish();

        if (completed >= batchTotal) break;

        if (completed === lastCompleted) stallPolls += 1;
        else {
          stallPolls = 0;
          lastCompleted = completed;
        }
        if (stallPolls >= SEND_BATCH_STALL_LIMIT) break;

        await sleep(SEND_BATCH_POLL_MS, options?.signal);
      }

      result.ok = completed;
      result.failed = Math.max(0, batchTotal - completed);
      if (result.failed > 0) {
        result.errors.push(`${result.failed} leads could not be queued (still processing or failed)`);
      }
    } else {
      result.sequencer = batchResult.sequencer;
      result.ok = batchResult.ok;
      result.failed = batchResult.failed;
      for (const err of batchResult.errors) {
        if (!result.errors.includes(err)) result.errors.push(err);
      }
      for (const row of batchResult.results) {
        if (!row.ok && row.error) {
          result.errors.push(row.error);
        }
      }
    }

    queue[0] = {
      ...queue[0],
      status: result.failed > 0 && result.ok === 0 ? "failed" : "queued",
      error: result.failed > 0 && result.ok === 0 ? result.errors[0] : undefined,
    };
  } catch (e) {
    if (options?.signal?.aborted) {
      queue[0] = { ...queue[0], status: "cancelled" };
      result.cancelled = 1;
    } else {
      const message = e instanceof Error ? e.message : "Batch send failed";
      queue[0] = { ...queue[0], status: "failed", error: message };
      result.failed = params.totalHint ?? 1;
      result.errors.push(message);
    }
  }

  publish();
  return result;
}

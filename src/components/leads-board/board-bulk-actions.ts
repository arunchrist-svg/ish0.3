import {
  approveOutreach,
  fetchLead,
  runWriterSequence,
  sendOutreach,
  type LeadQueueItem,
  type WriterDraft,
} from "@/lib/api-client";
import { sendWithGateConfirm } from "@/lib/outreach/send-with-gate-confirm";
import { resolveDraftBody, resolveDraftSubject } from "@/lib/email/draft-variants";

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

function pickDraftCopy(draft: WriterDraft): { subject?: string; body?: string } {
  return {
    subject: resolveDraftSubject(draft) || draft.subjectA,
    body: resolveDraftBody(draft) || draft.emailBody,
  };
}

function resolveSendDraft(lead: Awaited<ReturnType<typeof fetchLead>>): WriterDraft | null {
  const sequence = lead.outreachSequence ?? [];
  const email1 = sequence.find((d) => d.sequencePosition === 1);
  return email1 ?? lead.outreach ?? null;
}

export async function writeEmailsForLeads(
  leads: LeadQueueItem[],
  onProgress?: (progress: BoardBulkProgress) => void,
): Promise<BoardBulkResult> {
  const result: BoardBulkResult = { ok: 0, failed: 0, cancelled: 0, errors: [] };
  const total = leads.length;

  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    onProgress?.({ current: i + 1, total, leadName: lead.name });
    try {
      await runWriterSequence(lead.id);
      result.ok += 1;
    } catch (e) {
      result.failed += 1;
      result.errors.push(
        `${lead.name}: ${e instanceof Error ? e.message : "Write failed"}`,
      );
    }
  }

  return result;
}

async function sendOneLead(lead: LeadQueueItem): Promise<void> {
  const detail = await fetchLead(lead.id);
  const draft = resolveSendDraft(detail);
  if (!draft?.id) {
    throw new Error("No email draft ready");
  }

  const { subject, body } = pickDraftCopy(draft);
  if (!subject?.trim() || !body?.trim()) {
    throw new Error("Draft is missing subject or body");
  }

  const { approvalId } = await approveOutreach({
    leadOutreachId: draft.id,
    leadId: lead.id,
    channel: "email",
    status: "approved",
    subjectUsed: subject,
    bodyUsed: body,
  });

  await sendWithGateConfirm((overrides) => sendOutreach(approvalId, overrides));
}

export type SendEmailsOptions = {
  signal?: AbortSignal;
  onQueueChange?: (queue: SendQueueItem[]) => void;
  /** Injectable for tests. */
  gapMinutes?: () => number;
  wait?: (ms: number, signal?: AbortSignal) => Promise<void>;
};

/**
 * Sends one lead at a time with a random 1-5 minute gap between sends so a
 * batch does not look like a burst to receiving mail providers.
 */
export async function sendEmailsForLeads(
  leads: LeadQueueItem[],
  options?: SendEmailsOptions,
): Promise<BoardBulkResult> {
  const result: BoardBulkResult = { ok: 0, failed: 0, cancelled: 0, errors: [] };
  const nextGap = options?.gapMinutes ?? randomGapMinutes;
  const wait = options?.wait ?? sleep;

  const queue: SendQueueItem[] = leads.map((lead) => ({
    leadId: lead.id,
    name: lead.name,
    status: "queued",
  }));

  function publish() {
    options?.onQueueChange?.(queue.map((item) => ({ ...item })));
  }

  publish();

  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];

    if (options?.signal?.aborted) {
      for (let j = i; j < queue.length; j++) {
        queue[j] = { ...queue[j], status: "cancelled", gapMinutes: undefined, waitUntil: undefined };
        result.cancelled += 1;
      }
      publish();
      break;
    }

    if (i > 0) {
      const gap = nextGap();
      queue[i] = {
        ...queue[i],
        status: "waiting",
        gapMinutes: gap,
        waitUntil: Date.now() + gap * 60_000,
      };
      publish();
      try {
        await wait(gap * 60_000, options?.signal);
      } catch {
        for (let j = i; j < queue.length; j++) {
          queue[j] = { ...queue[j], status: "cancelled", gapMinutes: undefined, waitUntil: undefined };
          result.cancelled += 1;
        }
        publish();
        break;
      }
    }

    queue[i] = { ...queue[i], status: "sending", gapMinutes: undefined, waitUntil: undefined };
    publish();

    try {
      await sendOneLead(lead);
      queue[i] = { ...queue[i], status: "sent", waitUntil: undefined };
      result.ok += 1;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Send failed";
      queue[i] = { ...queue[i], status: "failed", error: message, waitUntil: undefined };
      result.failed += 1;
      result.errors.push(`${lead.name}: ${message}`);
    }
    publish();
  }

  return result;
}

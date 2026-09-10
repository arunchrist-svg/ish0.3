import { describe, expect, it, vi, beforeEach } from "vitest";
import type { LeadQueueItem } from "@/lib/api-client";
import {
  MAX_SEND_GAP_MINUTES,
  MIN_SEND_GAP_MINUTES,
  randomGapMinutes,
  sendEmailsForLeads,
  sendEmailsForStage,
  SendCancelledError,
  sleep,
} from "../board-bulk-actions";

vi.mock("@/lib/api-client", () => ({
  fetchLead: vi.fn(),
  approveOutreach: vi.fn(),
  sendOutreach: vi.fn(),
  sendBatchOutreach: vi.fn(),
  runWriterSequence: vi.fn(),
}));

vi.mock("@/lib/outreach/send-with-gate-confirm", () => ({
  sendWithGateConfirm: vi.fn(async (send: (overrides: object) => Promise<unknown>) => send({})),
}));

import { sendBatchOutreach } from "@/lib/api-client";

function lead(id: string, name: string): LeadQueueItem {
  return {
    id,
    name,
    title: "HR",
    company: "Acme",
    city: "Bengaluru",
    score: 60,
    status: "draft_ready",
    action: "Send email",
    emailStatus: "unverified",
  };
}

describe("randomGapMinutes", () => {
  it("returns only whole minutes in 1..5", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) {
      const gap = randomGapMinutes(() => i / 200);
      expect(gap).toBeGreaterThanOrEqual(MIN_SEND_GAP_MINUTES);
      expect(gap).toBeLessThanOrEqual(MAX_SEND_GAP_MINUTES);
      expect(Number.isInteger(gap)).toBe(true);
      seen.add(gap);
    }
    expect(seen).toEqual(new Set([1, 2, 3, 4, 5]));
  });
});

describe("sendEmailsForLeads batch planner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(sendBatchOutreach).mockResolvedValue({
      mode: "queued",
      ok: 3,
      failed: 0,
      errors: [],
      results: [
        { leadId: "a", ok: true, scheduledFor: "2026-09-10T03:30:00.000Z" },
        { leadId: "b", ok: true, scheduledFor: "2026-09-10T03:33:00.000Z" },
        { leadId: "c", ok: true, scheduledFor: "2026-09-10T03:36:00.000Z" },
      ],
      plan: { dailyCap: 30, timezone: "Asia/Kolkata", spanDays: 1, firstAt: null, lastAt: null },
    });
  });

  it("calls batch API once with all lead ids", async () => {
    const statuses: string[][] = [];
    const result = await sendEmailsForLeads([lead("a", "Ada"), lead("b", "Bo"), lead("c", "Cy")], {
      onQueueChange: (queue) => statuses.push(queue.map((item) => item.status)),
    });

    expect(result).toEqual({ ok: 3, failed: 0, cancelled: 0, errors: [], planSpanDays: 1 });
    expect(sendBatchOutreach).toHaveBeenCalledTimes(1);
    expect(sendBatchOutreach).toHaveBeenCalledWith({ leadIds: ["a", "b", "c"] });
    expect(statuses.at(-1)).toEqual(["queued", "queued", "queued"]);
  });

  it("cancels when aborted before batch call", async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await sendEmailsForLeads([lead("a", "Ada")], { signal: controller.signal });
    expect(result.cancelled).toBe(1);
    expect(sendBatchOutreach).not.toHaveBeenCalled();
  });
});

describe("sendEmailsForStage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(sendBatchOutreach).mockResolvedValue({
      mode: "queued",
      ok: 1252,
      failed: 0,
      errors: [],
      results: [],
      plan: { dailyCap: 30, timezone: "Asia/Kolkata", spanDays: 42, firstAt: null, lastAt: null },
      sequencer: { processed: 23, failed: 0, skipped: 0, pendingReview: 0 },
    });
  });

  it("calls batch API with statuses and processDue", async () => {
    const result = await sendEmailsForStage(
      { statuses: ["draft_ready", "approved"], totalHint: 1252 },
      { processDue: true },
    );

    expect(sendBatchOutreach).toHaveBeenCalledWith({
      statuses: ["draft_ready", "approved"],
      processDue: true,
    });
    expect(result.ok).toBe(1252);
    expect(result.sequencer?.processed).toBe(23);
  });
});

describe("sleep", () => {
  it("rejects immediately when already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(sleep(1000, controller.signal)).rejects.toBeInstanceOf(SendCancelledError);
  });
});

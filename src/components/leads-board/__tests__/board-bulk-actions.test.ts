import { describe, expect, it, vi, beforeEach } from "vitest";
import type { LeadQueueItem } from "@/lib/api-client";
import {
  MAX_SEND_GAP_MINUTES,
  MIN_SEND_GAP_MINUTES,
  randomGapMinutes,
  sendEmailsForLeads,
  SendCancelledError,
  sleep,
} from "../board-bulk-actions";

vi.mock("@/lib/api-client", () => ({
  fetchLead: vi.fn(),
  approveOutreach: vi.fn(),
  sendOutreach: vi.fn(),
  runWriterSequence: vi.fn(),
}));

vi.mock("@/lib/outreach/send-with-gate-confirm", () => ({
  sendWithGateConfirm: vi.fn(async (send: (overrides: object) => Promise<unknown>) => send({})),
}));

import { approveOutreach, fetchLead } from "@/lib/api-client";

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

  it("maps 0 to 1 and just-below-1 to 5", () => {
    expect(randomGapMinutes(() => 0)).toBe(1);
    expect(randomGapMinutes(() => 0.999)).toBe(5);
  });
});

describe("sendEmailsForLeads spaced loop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchLead).mockResolvedValue({
      id: "lead",
      outreach: {
        id: "draft-1",
        subjectA: "Hello",
        emailBody: "Body",
        sequencePosition: 1,
      },
    } as Awaited<ReturnType<typeof fetchLead>>);
    vi.mocked(approveOutreach).mockResolvedValue({ approvalId: "appr-1" } as Awaited<
      ReturnType<typeof approveOutreach>
    >);
  });

  it("sends the first lead immediately and waits a gap before later leads", async () => {
    const waits: number[] = [];
    const statuses: string[][] = [];
    const gaps = [3, 1];
    let gapIndex = 0;

    const result = await sendEmailsForLeads([lead("a", "Ada"), lead("b", "Bo"), lead("c", "Cy")], {
      gapMinutes: () => gaps[gapIndex++] ?? 2,
      wait: async (ms) => {
        waits.push(ms);
      },
      onQueueChange: (queue) => statuses.push(queue.map((item) => item.status)),
    });

    expect(result).toEqual({ ok: 3, failed: 0, cancelled: 0, errors: [] });
    expect(waits).toEqual([3 * 60_000, 1 * 60_000]);
    expect(fetchLead).toHaveBeenCalledTimes(3);
    expect(statuses.some((row) => row[1] === "waiting")).toBe(true);
    expect(statuses.at(-1)).toEqual(["sent", "sent", "sent"]);
  });

  it("cancels remaining leads when the wait is aborted", async () => {
    const controller = new AbortController();
    const result = await sendEmailsForLeads([lead("a", "Ada"), lead("b", "Bo")], {
      signal: controller.signal,
      gapMinutes: () => 2,
      wait: async (_ms, signal) => {
        controller.abort();
        await sleep(1, signal);
      },
    });

    expect(result.ok).toBe(1);
    expect(result.cancelled).toBe(1);
    expect(result.failed).toBe(0);
    expect(fetchLead).toHaveBeenCalledTimes(1);
  });

  it("rejects sleep immediately when already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(sleep(1000, controller.signal)).rejects.toBeInstanceOf(SendCancelledError);
  });
});

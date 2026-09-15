import { describe, expect, it, vi, beforeEach } from "vitest";

const getAutopilotRun = vi.fn();
const batchQueueInitialEmails = vi.fn();
const findFirst = vi.fn();

vi.mock("@/lib/agents/autopilot-store", () => ({
  getAutopilotRun: (...args: unknown[]) => getAutopilotRun(...args),
}));

vi.mock("@/lib/outreach/batch-send-initial", () => ({
  batchQueueInitialEmails: (...args: unknown[]) => batchQueueInitialEmails(...args),
}));

vi.mock("@/db", () => ({
  db: { query: { leads: { findFirst: (...args: unknown[]) => findFirst(...args) } } },
  leads: { id: "id" },
}));

import { queueAutopilotEmailIfEnabled } from "@/lib/agents/autopilot-send";

describe("queueAutopilotEmailIfEnabled", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("skips non-autopilot writer batches", async () => {
    const result = await queueAutopilotEmailIfEnabled({
      leadId: "lead-1",
      tenantId: "tenant-1",
      batchId: "manual",
    });
    expect(result.queued).toBe(false);
    expect(batchQueueInitialEmails).not.toHaveBeenCalled();
  });

  it("queues Email 1 after an autopilot draft when autoSend is on", async () => {
    getAutopilotRun.mockResolvedValue({
      id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      createdByUserId: "user-1",
      input: { autoSend: true },
    });
    findFirst.mockResolvedValue({
      id: "lead-1",
      tenantId: "tenant-1",
      workspaceId: "ws-1",
      createdByUserId: "user-1",
    });
    batchQueueInitialEmails.mockResolvedValue({ ok: 1, failed: 0, errors: [], results: [], plan: {} });

    const result = await queueAutopilotEmailIfEnabled({
      leadId: "lead-1",
      tenantId: "tenant-1",
      batchId: "autopilot:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee:0",
    });
    expect(result.queued).toBe(true);
    expect(batchQueueInitialEmails).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-1", workspaceId: "ws-1", userId: "user-1" }),
      expect.objectContaining({ leadIds: ["lead-1"] }),
    );
  });
});

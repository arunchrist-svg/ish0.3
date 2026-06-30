import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const sendMock = vi.fn().mockResolvedValue(undefined);

vi.mock("@/inngest/client", () => ({
  inngest: { send: sendMock },
}));

vi.mock("@/lib/agents/research-processor", () => ({
  triggerPendingResearchAsync: vi.fn(),
  processPendingResearch: vi.fn(),
}));

describe("enqueue", () => {
  const original = process.env.INNGEST_EVENT_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.INNGEST_EVENT_KEY;
  });

  afterEach(() => {
    if (original === undefined) delete process.env.INNGEST_EVENT_KEY;
    else process.env.INNGEST_EVENT_KEY = original;
  });

  it("uses inline fallback when Inngest is not configured", async () => {
    const { enqueueResearchForLeads } = await import("@/lib/jobs/enqueue");
    const { triggerPendingResearchAsync } = await import("@/lib/agents/research-processor");
    await enqueueResearchForLeads(["a", "b", "c"]);
    expect(triggerPendingResearchAsync).toHaveBeenCalledWith(3);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("sends Inngest events when configured", async () => {
    process.env.INNGEST_EVENT_KEY = "test-key";
    const { enqueueResearchForLead } = await import("@/lib/jobs/enqueue");
    await enqueueResearchForLead("lead-1");
    expect(sendMock).toHaveBeenCalledWith({
      name: "research/lead.requested",
      data: { leadId: "lead-1" },
    });
  });
});

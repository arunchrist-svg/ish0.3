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

  it("queues writer via Inngest or returns sync fallback", async () => {
    const { enqueueWriterRun } = await import("@/lib/jobs/enqueue");
    const sync = await enqueueWriterRun({ leadId: "w1", tenantId: "t1" });
    expect(sync).toBe("sync");
    expect(sendMock).not.toHaveBeenCalled();

    process.env.INNGEST_EVENT_KEY = "test-key";
    const queued = await enqueueWriterRun({ leadId: "w2", tenantId: "t1", mode: "single" });
    expect(queued).toBe("queued");
    expect(sendMock).toHaveBeenCalledWith({
      name: "writer/lead.requested",
      data: expect.objectContaining({ leadId: "w2", tenantId: "t1", mode: "single" }),
    });
  });

  it("queues enrich via Inngest or returns sync fallback", async () => {
    const { enqueueEnrichLead } = await import("@/lib/jobs/enqueue");
    const sync = await enqueueEnrichLead({ leadId: "e1", tenantId: "t1", mode: "free" });
    expect(sync).toBe("sync");

    process.env.INNGEST_EVENT_KEY = "test-key";
    const queued = await enqueueEnrichLead({ leadId: "e2", tenantId: "t1", mode: "paid" });
    expect(queued).toBe("queued");
    expect(sendMock).toHaveBeenCalledWith({
      name: "enrich/lead.requested",
      data: expect.objectContaining({ leadId: "e2", mode: "paid" }),
    });
  });
});

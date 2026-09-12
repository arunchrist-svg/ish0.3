import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const runSequencer = vi.fn();

vi.mock("@/lib/agents/sequencer", () => ({
  runSequencer: (...args: unknown[]) => runSequencer(...args),
}));

import { GET, POST } from "../../sequencer/run/route";

const ORIGINAL_CRON_SECRET = process.env.CRON_SECRET;
const ORIGINAL_INNGEST_KEY = process.env.INNGEST_EVENT_KEY;

describe("SEQ-SEC-001 sequencer cron auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-cron-secret";
    process.env.INNGEST_EVENT_KEY = "inngest-present";
    runSequencer.mockResolvedValue({ processed: 0, failed: 0, skipped: 0, pendingReview: 0 });
  });

  afterEach(() => {
    process.env.CRON_SECRET = ORIGINAL_CRON_SECRET;
    process.env.INNGEST_EVENT_KEY = ORIGINAL_INNGEST_KEY;
  });

  it("returns 401 without bearer token", async () => {
    const res = await POST(new Request("http://localhost/api/sequencer/run", { method: "POST" }));
    expect(res.status).toBe(401);
    expect(runSequencer).not.toHaveBeenCalled();
  });

  it("returns 401 with wrong bearer token", async () => {
    const res = await POST(
      new Request("http://localhost/api/sequencer/run", {
        method: "POST",
        headers: { Authorization: "Bearer wrong-secret" },
      }),
    );
    expect(res.status).toBe(401);
    expect(runSequencer).not.toHaveBeenCalled();
  });

  it("returns 200 with valid bearer token", async () => {
    const res = await POST(
      new Request("http://localhost/api/sequencer/run", {
        method: "POST",
        headers: { Authorization: "Bearer test-cron-secret" },
      }),
    );
    expect(res.status).toBe(200);
    expect(runSequencer).toHaveBeenCalledOnce();
  });

  it("GET works with bearer and does not skip solely because Inngest key is set", async () => {
    expect(process.env.INNGEST_EVENT_KEY).toBeTruthy();
    const res = await GET(
      new Request("http://localhost/api/sequencer/run", {
        method: "GET",
        headers: { Authorization: "Bearer test-cron-secret" },
      }),
    );
    expect(res.status).toBe(200);
    expect(runSequencer).toHaveBeenCalledOnce();
    const body = await res.json();
    expect(body).toEqual({ processed: 0, failed: 0, skipped: 0, pendingReview: 0 });
  });

  it("accepts Vercel cron header without CRON_SECRET", async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(
      new Request("http://localhost/api/sequencer/run", {
        method: "GET",
        headers: { "x-vercel-cron": "1" },
      }),
    );
    expect(res.status).toBe(200);
    expect(runSequencer).toHaveBeenCalledOnce();
  });
});

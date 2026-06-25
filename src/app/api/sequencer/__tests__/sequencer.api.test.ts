import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const runSequencer = vi.fn();

vi.mock("@/lib/agents/sequencer", () => ({
  runSequencer: (...args: unknown[]) => runSequencer(...args),
}));

import { POST } from "../../sequencer/run/route";

const ORIGINAL_CRON_SECRET = process.env.CRON_SECRET;

describe("SEQ-SEC-001 sequencer cron auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-cron-secret";
    runSequencer.mockResolvedValue({ processed: 0 });
  });

  afterEach(() => {
    process.env.CRON_SECRET = ORIGINAL_CRON_SECRET;
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
});

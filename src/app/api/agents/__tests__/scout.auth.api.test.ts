import { describe, expect, it, afterEach } from "vitest";
import { POST } from "../../agents/scout/run/route";
import { clearTestSession, hasTestDatabase } from "@/test/api-helpers";

describe.skipIf(!hasTestDatabase())("AGENT-SEC-001 scout auth", () => {
  afterEach(() => {
    clearTestSession();
  });

  it("returns 401 without session", async () => {
    clearTestSession();
    const res = await POST(
      new Request("http://localhost/api/agents/scout/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cities: ["Bangalore"] }),
      }),
    );
    expect(res.status).toBe(401);
  });
});

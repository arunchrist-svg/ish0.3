import { describe, expect, it, afterEach } from "vitest";
import { PATCH as patchDraft } from "../../outreach/draft/route";
import { POST as approveOutreach } from "../../outreach/approve/route";
import { authenticateTestUser, clearTestSession, hasTestDatabase } from "@/test/api-helpers";

describe.skipIf(!hasTestDatabase())("OUTREACH-SEC-001 outreach auth", () => {
  afterEach(() => {
    clearTestSession();
  });

  it("returns 401 on PATCH draft without session", async () => {
    clearTestSession();
    const res = await patchDraft(
      new Request("http://localhost/api/outreach/draft", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadOutreachId: "00000000-0000-0000-0000-000000009999",
          emailBody: "test",
        }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 401 on POST approve without session", async () => {
    clearTestSession();
    const res = await approveOutreach(
      new Request("http://localhost/api/outreach/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadOutreachId: "00000000-0000-0000-0000-000000009999",
          leadId: "00000000-0000-0000-0000-000000009999",
          channel: "email",
          status: "approved",
        }),
      }),
    );
    expect(res.status).toBe(401);
  });
});

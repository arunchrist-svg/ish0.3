import { describe, expect, it, afterEach, beforeAll } from "vitest";
import { GET } from "../route";
import {
  authenticateTestUser,
  clearTestSession,
  hasTestDatabase,
} from "@/test/api-helpers";

describe.skipIf(!hasTestDatabase())("FUNNEL-API-001 funnel route", () => {
  beforeAll(async () => {
    await authenticateTestUser();
  });

  afterEach(() => {
    clearTestSession();
  });

  it("returns 401 without session", async () => {
    clearTestSession();
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns funnel data for authenticated tenant", async () => {
    await authenticateTestUser();
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("stages");
    expect(body).toHaveProperty("leadStatuses");
    expect(body).toHaveProperty("emailAccuracy");
    expect(Array.isArray(body.stages)).toBe(true);
    expect(Array.isArray(body.leadStatuses)).toBe(true);
  });

  it("includes seeded lead statuses", async () => {
    await authenticateTestUser();
    const res = await GET();
    const body = await res.json();
    const statuses = (body.leadStatuses as { status: string; count: number }[]).map((s) => s.status);
    expect(statuses).toContain("draft_ready");
    expect(statuses).toContain("replied");
  });
});

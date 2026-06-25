import { describe, expect, it, beforeAll, afterEach } from "vitest";
import { GET as listLeads } from "../route";
import { PATCH as patchLead } from "../[id]/route";
import {
  authenticateTestUser,
  clearTestSession,
  hasTestDatabase,
  TEST_LEAD_REPLIED_ID,
} from "@/test/api-helpers";
import { eq } from "drizzle-orm";
import { db, leads } from "@/db";

describe.skipIf(!hasTestDatabase())("LEADS-API-001 leads routes", () => {
  beforeAll(async () => {
    await authenticateTestUser();
    await db
      .update(leads)
      .set({ status: "replied", updatedAt: new Date() })
      .where(eq(leads.id, TEST_LEAD_REPLIED_ID));
  });

  afterEach(async () => {
    clearTestSession();
    await authenticateTestUser();
    await db
      .update(leads)
      .set({ status: "replied", updatedAt: new Date() })
      .where(eq(leads.id, TEST_LEAD_REPLIED_ID));
  });

  it("AUTH-SEC-001 returns 401 without session on list", async () => {
    clearTestSession();
    const res = await listLeads(new Request("http://localhost/api/leads"));
    expect(res.status).toBe(401);
  });

  it("lists leads for authenticated tenant", async () => {
    const res = await listLeads(new Request("http://localhost/api/leads"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.leads).toBeInstanceOf(Array);
    expect(body.leads.length).toBeGreaterThan(0);
    expect(body.leads[0]).toHaveProperty("name");
    expect(body.leads[0]).toHaveProperty("status");
  });

  it("filters leads by status", async () => {
    const res = await listLeads(
      new Request("http://localhost/api/leads?status=draft_ready"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.leads.every((l: { status: string }) => l.status === "draft_ready")).toBe(true);
  });

  it("rejects invalid manual status transition", async () => {
    const res = await patchLead(
      new Request("http://localhost/api/leads/" + TEST_LEAD_REPLIED_ID, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "closed" }),
      }),
      { params: Promise.resolve({ id: TEST_LEAD_REPLIED_ID }) },
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Cannot advance/);
  });

  it("allows valid manual advance from replied to tasting_sent", async () => {
    const res = await patchLead(
      new Request("http://localhost/api/leads/" + TEST_LEAD_REPLIED_ID, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "tasting_sent" }),
      }),
      { params: Promise.resolve({ id: TEST_LEAD_REPLIED_ID }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.status).toBe("tasting_sent");
  });

  it("requires status in PATCH body", async () => {
    const res = await patchLead(
      new Request("http://localhost/api/leads/" + TEST_LEAD_REPLIED_ID, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: TEST_LEAD_REPLIED_ID }) },
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 for unknown lead", async () => {
    const res = await patchLead(
      new Request("http://localhost/api/leads/00000000-0000-0000-0000-000000009999", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "tasting_sent" }),
      }),
      { params: Promise.resolve({ id: "00000000-0000-0000-0000-000000009999" }) },
    );
    expect(res.status).toBe(404);
  });
  it("AUTH-SEC-001 returns 401 on PATCH without session", async () => {
    clearTestSession();
    const res = await patchLead(
      new Request("http://localhost/api/leads/" + TEST_LEAD_REPLIED_ID, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "tasting_sent" }),
      }),
      { params: Promise.resolve({ id: TEST_LEAD_REPLIED_ID }) },
    );
    expect(res.status).toBe(401);
  });

  it("AUTH-SEC-002 returns 404 on PATCH for another tenant lead", async () => {
    const OTHER_TENANT_LEAD_ID = "00000000-0000-0000-0000-000000000012";
    const res = await patchLead(
      new Request("http://localhost/api/leads/" + OTHER_TENANT_LEAD_ID, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "tasting_sent" }),
      }),
      { params: Promise.resolve({ id: OTHER_TENANT_LEAD_ID }) },
    );
    expect(res.status).toBe(404);
  });

});

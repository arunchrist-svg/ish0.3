import { describe, expect, it, vi, beforeEach } from "vitest";
import { InsufficientCreditsError } from "@/lib/billing/credits";

const runWriter = vi.fn();

vi.mock("@/lib/agents/writer", () => ({
  runWriter: (...args: unknown[]) => runWriter(...args),
}));

vi.mock("@/lib/billing/credits", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/billing/credits")>();
  return {
    ...actual,
    assertCredits: vi.fn(),
    deductCredits: vi.fn().mockResolvedValue(100),
  };
});

vi.mock("@/lib/billing/analytics", () => ({
  checkLowBalanceAlerts: vi.fn(),
}));

vi.mock("@/lib/tenant", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tenant")>();
  return {
    ...actual,
    requireTenantContext: vi.fn(),
  };
});

vi.mock("@/db", () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([
            { id: "lead-1", tenantId: "tenant-1" },
          ]),
        }),
      }),
    }),
    query: {
      leadOutreach: {
        findFirst: vi.fn().mockResolvedValue({
          id: "outreach-1",
          leadId: "lead-1",
          subjectA: "Test subject",
          emailBody: "Test body",
          status: "draft",
        }),
      },
    },
  },
  leads: {},
  leadOutreach: {},
}));

import { POST } from "../../agents/writer/run/route";
import { requireTenantContext } from "@/lib/tenant";
import { assertCredits } from "@/lib/billing/credits";

const tenantCtx = {
  userId: "user-1",
  tenantId: "tenant-1",
  workspaceId: "ws-1",
  role: "owner" as const,
  platformRole: "user",
  isSuperadmin: false,
  onboardingStatus: "complete",
  onboardingStep: 6,
  demoMode: true,
};

describe("AGENT-API-002 writer route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireTenantContext).mockResolvedValue(tenantCtx);
    runWriter.mockResolvedValue("outreach-1");
  });

  it("returns 400 when leadId is missing", async () => {
    const res = await POST(
      new Request("http://localhost/api/agents/writer/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns draft on successful run", async () => {
    const res = await POST(
      new Request("http://localhost/api/agents/writer/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: "lead-1" }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.draft).toBeDefined();
    expect(body.draft.subjectA).toBe("Test subject");
    expect(runWriter).toHaveBeenCalledWith("lead-1", expect.any(Object));
  });

  it("returns 402 when credits are insufficient", async () => {
    vi.mocked(assertCredits).mockRejectedValueOnce(new InsufficientCreditsError(8, 2));
    const res = await POST(
      new Request("http://localhost/api/agents/writer/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: "lead-1" }),
      }),
    );
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.code).toBe("INSUFFICIENT_CREDITS");
  });

  it("returns 404 when lead belongs to another tenant", async () => {
    const { db } = await import("@/db");
    vi.mocked(db.select).mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([
            { id: "lead-1", tenantId: "other-tenant" },
          ]),
        }),
      }),
    } as never);

    const res = await POST(
      new Request("http://localhost/api/agents/writer/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: "lead-1" }),
      }),
    );
    expect(res.status).toBe(404);
  });
});

import { describe, expect, it, vi, beforeEach } from "vitest";

const runScoutBatch = vi.fn();

vi.mock("@/lib/agents/scout", () => ({
  runScoutBatch: (...args: unknown[]) => runScoutBatch(...args),
}));

vi.mock("@/lib/tenant", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tenant")>();
  return {
    ...actual,
    requireTenantContext: vi.fn(),
  };
});

import { POST } from "../../agents/scout/run/route";
import { requireTenantContext, UnauthorizedError } from "@/lib/tenant";

describe("AGENT-API-001 scout route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runScoutBatch.mockResolvedValue({
      companiesFound: 3,
      leadsSaved: 2,
      errors: [],
    });
  });

  it("returns error when tenant context is missing", async () => {
    vi.mocked(requireTenantContext).mockRejectedValueOnce(new UnauthorizedError());
    const res = await POST(
      new Request("http://localhost/api/agents/scout/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cities: ["Bangalore"] }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("runs scout batch with tenant context", async () => {
    vi.mocked(requireTenantContext).mockResolvedValueOnce({
      userId: "user-1",
      tenantId: "tenant-1",
      workspaceId: "ws-1",
      role: "owner",
      platformRole: "user",
      isSuperadmin: false,
      onboardingStatus: "complete",
      onboardingStep: 6,
      demoMode: true,
    });

    const res = await POST(
      new Request("http://localhost/api/agents/scout/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cities: ["Bangalore"], industries: ["IT"] }),
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.leadsSaved).toBe(2);
    expect(runScoutBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        workspaceId: "ws-1",
        cities: ["Bangalore"],
        industries: ["IT"],
      }),
    );
  });

  it("uses default data mode when not provided", async () => {
    vi.mocked(requireTenantContext).mockResolvedValueOnce({
      userId: "user-1",
      tenantId: "tenant-1",
      workspaceId: "ws-1",
      role: "owner",
      platformRole: "user",
      isSuperadmin: false,
      onboardingStatus: "complete",
      onboardingStep: 6,
      demoMode: true,
    });

    await POST(
      new Request("http://localhost/api/agents/scout/run", {
        method: "POST",
        body: JSON.stringify({ cities: ["Mysore"] }),
      }),
    );

    expect(runScoutBatch).toHaveBeenCalledWith(
      expect.objectContaining({ dataMode: expect.any(String) }),
    );
  });
});

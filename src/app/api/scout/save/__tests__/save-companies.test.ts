import { describe, expect, it, vi, beforeEach } from "vitest";

const saveScoutCompanies = vi.fn();
const saveScoutLeads = vi.fn();

vi.mock("@/lib/scout/save-leads", () => ({
  saveScoutCompanies: (...args: unknown[]) => saveScoutCompanies(...args),
  saveScoutLeads: (...args: unknown[]) => saveScoutLeads(...args),
}));

vi.mock("@/lib/tenant", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tenant")>();
  return {
    ...actual,
    requireTenantContext: vi.fn(),
  };
});

vi.mock("@/lib/settings/workspace-settings", () => ({
  getResolvedWorkspaceEnrichmentConfig: vi.fn(),
}));

import { POST } from "../route";
import { requireTenantContext } from "@/lib/tenant";

const ownerCtx = {
  userId: "user-1",
  tenantId: "tenant-1",
  workspaceId: "ws-1",
  role: "owner" as const,
  platformRole: "user",
  isSuperadmin: false,
  onboardingStatus: "complete",
  onboardingStep: 5,
  demoMode: true,
  tenantSlug: "test",
  mustChangePassword: false,
};

describe("POST /api/scout/save company-only", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireTenantContext).mockResolvedValue(ownerCtx);
    saveScoutCompanies.mockResolvedValue({
      saved: 1,
      accounts: [{ id: "acc-1", name: "Bosch" }],
    });
  });

  it("saves a company with people: [] and does not call saveScoutLeads", async () => {
    const res = await POST(
      new Request("http://localhost/api/scout/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          people: [],
          company: { name: "Bosch", city: "Bengaluru", dataSource: "tavily+llm" },
        }),
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.companySaved).toBe(true);
    expect(body.accountId).toBe("acc-1");
    expect(saveScoutCompanies).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        workspaceId: "ws-1",
        companies: [expect.objectContaining({ name: "Bosch", city: "Bengaluru" })],
      }),
    );
    expect(saveScoutLeads).not.toHaveBeenCalled();
  });

  it("still requires a company name", async () => {
    const res = await POST(
      new Request("http://localhost/api/scout/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ people: [], company: { name: "" } }),
      }),
    );
    expect(res.status).toBe(400);
    expect(saveScoutCompanies).not.toHaveBeenCalled();
  });
});

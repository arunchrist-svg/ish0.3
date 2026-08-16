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

describe("POST /api/scout/save/batch company-only", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireTenantContext).mockResolvedValue(ownerCtx);
    saveScoutCompanies.mockResolvedValue({
      saved: 2,
      accounts: [
        { id: "acc-1", name: "Bosch" },
        { id: "acc-2", name: "Titan" },
      ],
    });
  });

  it("persists companies without fetching people", async () => {
    const res = await POST(
      new Request("http://localhost/api/scout/save/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companies: [
            { id: "1", company: { name: "Bosch", city: "Bengaluru", dataSource: "scout" }, people: [] },
            { id: "2", company: { name: "Titan", city: "Hosur", dataSource: "scout" }, people: [] },
          ],
        }),
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.saved).toBe(2);
    expect(body.results).toHaveLength(2);
    expect(saveScoutCompanies).toHaveBeenCalledTimes(1);
    expect(saveScoutLeads).not.toHaveBeenCalled();
  });
});

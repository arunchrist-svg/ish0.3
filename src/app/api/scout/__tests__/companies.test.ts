import { beforeEach, describe, expect, it, vi } from "vitest";

const discoverCompanies = vi.fn();
const getResolvedWorkspaceEnrichmentConfig = vi.fn();

vi.mock("@/lib/enrichment/waterfall", () => ({
  discoverCompanies: (...args: unknown[]) => discoverCompanies(...args),
}));

vi.mock("@/lib/settings/workspace-settings", () => ({
  getResolvedWorkspaceEnrichmentConfig: (...args: unknown[]) =>
    getResolvedWorkspaceEnrichmentConfig(...args),
}));

vi.mock("@/lib/enrichment/discovery-prerequisites", () => ({
  checkDiscoveryPrerequisites: vi.fn(() => []),
}));

vi.mock("@/lib/enrichment/employee-size", () => ({
  normalizeEmployeeBandIds: (bands: string[]) => bands,
}));

vi.mock("@/lib/billing/credits", () => ({
  assertCredits: vi.fn(),
  deductCredits: vi.fn(),
}));

vi.mock("@/lib/auth/permissions", () => ({
  requirePipelineWrite: vi.fn(),
}));

vi.mock("@/lib/tenant", () => ({
  requireTenantContext: vi.fn(),
  UnauthorizedError: class UnauthorizedError extends Error {},
  ForbiddenError: class ForbiddenError extends Error {},
}));

import { POST } from "../companies/route";
import { requireTenantContext } from "@/lib/tenant";

const resolvedPlacesOffConfig = {
  searchProvider: "google_places" as const,
  peopleSearchProvider: "none" as const,
  enrichProvider: "website_email" as const,
  fallbackToAI: false,
  enrichOnImport: true,
  dataMode: "free" as const,
  scoutCompaniesLimit: 1,
  scoutLeadsLimit: 1,
  strictPeopleFilters: false,
};

describe("POST /api/scout/companies provider resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireTenantContext).mockResolvedValue({
      userId: "user-1",
      tenantId: "tenant-1",
      workspaceId: "workspace-1",
      role: "owner",
      platformRole: "user",
      isSuperadmin: false,
      onboardingStatus: "complete",
      onboardingStep: 5,
      demoMode: true,
      tenantSlug: "test",
      mustChangePassword: false,
    });
    getResolvedWorkspaceEnrichmentConfig.mockResolvedValue(resolvedPlacesOffConfig);
    discoverCompanies.mockResolvedValue({ companies: [], warnings: [], errors: [] });
  });

  it("passes the resolved Places and people-Off config to discovery", async () => {
    const response = await POST(
      new Request("http://localhost/api/scout/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cities: ["Mysore"],
          industries: ["Technology", "Healthcare"],
          dataMode: "free",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(discoverCompanies).toHaveBeenCalledWith(
      expect.objectContaining({
        dataMode: "free",
        config: resolvedPlacesOffConfig,
      }),
    );
    expect(discoverCompanies.mock.calls[0][0].config.searchProvider).toBe("google_places");
    expect(discoverCompanies.mock.calls[0][0].config.peopleSearchProvider).toBe("none");
  });

  it("uses the same resolved config for the NDJSON stream", async () => {
    const response = await POST(
      new Request("http://localhost/api/scout/companies?stream=1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cities: ["Mysore"],
          industries: ["Technology", "Healthcare"],
          dataMode: "free",
        }),
      }),
    );

    expect(response.status).toBe(200);
    await response.text();
    expect(discoverCompanies).toHaveBeenCalledWith(
      expect.objectContaining({ config: resolvedPlacesOffConfig }),
    );
  });
});

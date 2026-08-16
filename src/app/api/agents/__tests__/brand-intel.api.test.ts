import { describe, expect, it, vi, beforeEach } from "vitest";

const runGiftIntelSweep = vi.fn();
const runOccasionIntelSweep = vi.fn();

vi.mock("@/lib/settings/workspace-settings", () => ({
  getResolvedEnrichmentConfigForWorkspace: vi.fn().mockResolvedValue({
    giftIntelProductCategory: "Sweets",
    giftIntelCompetitorBrands: ["Kanti Sweets", "Anand Sweets"],
  }),
}));

vi.mock("@/lib/agents/brand-intel", () => ({
  runGiftIntelSweep: (...args: unknown[]) => runGiftIntelSweep(...args),
}));

vi.mock("@/lib/agents/occasion-intel", () => ({
  runOccasionIntelSweep: (...args: unknown[]) => runOccasionIntelSweep(...args),
}));

vi.mock("@/lib/tenant", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tenant")>();
  return {
    ...actual,
    requireTenantContext: vi.fn(),
  };
});

import { POST } from "../brand-intel/run/route";
import { requireTenantContext, UnauthorizedError } from "@/lib/tenant";

describe("AGENT-API brand-intel route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runGiftIntelSweep.mockResolvedValue({
      results: [],
      autoMerged: 0,
      pendingConfirmations: [],
      errors: [],
      stats: {
        queriesRun: 4,
        hitsFound: 10,
        hitsAfterPreFilter: 6,
        hitsExtracted: 2,
        byTier: { 1: 2 },
        combinationsRun: 2,
        targetBrands: ["Kanti Sweets", "Anand Sweets"],
        targetCities: ["Bengaluru"],
      },
    });
  });

  it("returns 401 when tenant context is missing", async () => {
    vi.mocked(requireTenantContext).mockRejectedValueOnce(new UnauthorizedError());
    const res = await POST(
      new Request("http://localhost/api/agents/brand-intel/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ competitorBrands: ["Kanti Sweets"] }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("runs gift intel sweep with multiple brands and cities", async () => {
    vi.mocked(requireTenantContext).mockResolvedValueOnce({
      userId: "user-1",
      tenantId: "tenant-1",
      workspaceId: "ws-1",
      role: "owner",
      platformRole: "user",
      isSuperadmin: false,
      onboardingStatus: "complete",
      onboardingStep: 5,
      demoMode: true,
      tenantSlug: "demo",
      mustChangePassword: false,
    });

    const res = await POST(
      new Request("http://localhost/api/agents/brand-intel/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          competitorBrands: ["Kanti Sweets", "Anand Sweets"],
          cities: ["Bengaluru"],
          enabledSourceTiers: [1, 2],
        }),
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.stats.combinationsRun).toBe(2);
    expect(runGiftIntelSweep).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        workspaceId: "ws-1",
        targetBrands: ["Kanti Sweets", "Anand Sweets"],
        targetCategory: "Sweets",
        targetCities: ["Bengaluru"],
        enabledSourceTiers: [1, 2],
      }),
    );
  });

  it("runs coming soon sweep without a competitor brand and drops Entire India as a city", async () => {
    vi.mocked(requireTenantContext).mockResolvedValueOnce({
      userId: "user-1",
      tenantId: "tenant-1",
      workspaceId: "ws-1",
      role: "owner",
      platformRole: "user",
      isSuperadmin: false,
      onboardingStatus: "complete",
      onboardingStep: 5,
      demoMode: true,
      tenantSlug: "demo",
      mustChangePassword: false,
    });
    runOccasionIntelSweep.mockResolvedValueOnce({
      results: [],
      autoMerged: 0,
      pendingConfirmations: [],
      errors: [],
      stats: { queriesRun: 3, hitsFound: 4, hitsAfterPreFilter: 2, hitsExtracted: 1, byTier: { 1: 1 }, combinationsRun: 1 },
    });

    const res = await POST(
      new Request("http://localhost/api/agents/brand-intel/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sweepMode: "upcoming_openings",
          cities: ["Entire India", "Bengaluru"],
          enabledSourceTiers: [1, 2],
        }),
      }),
    );

    expect(res.status).toBe(200);
    expect(runGiftIntelSweep).not.toHaveBeenCalled();
    expect(runOccasionIntelSweep).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        workspaceId: "ws-1",
        families: ["coming_soon"],
        targetCities: ["Bengaluru"],
        enabledSourceTiers: [1, 2],
      }),
    );
  });

  it("omits targetCities when the only city is Entire India", async () => {
    vi.mocked(requireTenantContext).mockResolvedValueOnce({
      userId: "user-1",
      tenantId: "tenant-1",
      workspaceId: "ws-1",
      role: "owner",
      platformRole: "user",
      isSuperadmin: false,
      onboardingStatus: "complete",
      onboardingStep: 5,
      demoMode: true,
      tenantSlug: "demo",
      mustChangePassword: false,
    });

    const res = await POST(
      new Request("http://localhost/api/agents/brand-intel/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          competitorBrands: ["Kanti Sweets"],
          cities: ["Entire India"],
        }),
      }),
    );

    expect(res.status).toBe(200);
    expect(runGiftIntelSweep).toHaveBeenCalledWith(
      expect.objectContaining({
        targetBrands: ["Kanti Sweets"],
        targetCities: undefined,
      }),
    );
  });
});

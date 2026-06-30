import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/tenant", () => ({
  listActiveMemberships: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
  },
  tenants: { onboardingStatus: "onboarding_status", id: "id" },
}));

import { listActiveMemberships } from "@/lib/tenant";
import { db } from "@/db";
import { resolvePostAuthDestination, POST_AUTH_HOME } from "@/lib/auth/post-auth-redirect";

describe("resolvePostAuthDestination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns change-password when required", async () => {
    const result = await resolvePostAuthDestination({
      userId: "u1",
      platformRole: "user",
      mustChangePassword: true,
    });
    expect(result.redirect).toBe("/change-password");
  });

  it("returns Home for single-org tenant user", async () => {
    vi.mocked(listActiveMemberships).mockResolvedValue([
      { tenantId: "t1", role: "member", slug: "acme", name: "Acme" },
    ]);

    const selectMock = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ onboardingStatus: "complete" }]),
        }),
      }),
    });
    vi.mocked(db.select).mockImplementation(selectMock);

    const result = await resolvePostAuthDestination({
      userId: "u1",
      platformRole: "user",
      mustChangePassword: false,
    });

    expect(result.redirect).toBe(POST_AUTH_HOME);
    expect(result.tenantId).toBe("t1");
  });

  it("returns Home for superadmin with one org membership", async () => {
    vi.mocked(listActiveMemberships).mockResolvedValue([
      { tenantId: "t1", role: "owner", slug: "ish", name: "ISH" },
    ]);

    const selectMock = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ onboardingStatus: "complete" }]),
        }),
      }),
    });
    vi.mocked(db.select).mockImplementation(selectMock);

    const result = await resolvePostAuthDestination({
      userId: "u1",
      platformRole: "superadmin",
      mustChangePassword: false,
    });

    expect(result.redirect).toBe("/");
    expect(result.tenantId).toBe("t1");
  });

  it("returns admin for superadmin without memberships", async () => {
    vi.mocked(listActiveMemberships).mockResolvedValue([]);

    const result = await resolvePostAuthDestination({
      userId: "u1",
      platformRole: "superadmin",
      mustChangePassword: false,
    });

    expect(result.redirect).toBe("/admin");
    expect(result.tenantId).toBeNull();
  });
});

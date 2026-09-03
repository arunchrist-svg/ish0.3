import { describe, expect, it } from "vitest";
import {
  canAccessLeadRecord,
  canViewAllTenantLeads,
  leadVisibilityForRole,
} from "@/lib/leads/lead-visibility";

describe("lead visibility", () => {
  it("superadmin can view all tenant leads", () => {
    expect(canViewAllTenantLeads("superadmin")).toBe(true);
    expect(leadVisibilityForRole("admin", "superadmin")).toBe("all");
  });

  it("owner sees all tenant leads", () => {
    expect(leadVisibilityForRole("owner", "user")).toBe("all");
    expect(
      canAccessLeadRecord(
        { userId: "owner-1", role: "owner", platformRole: "user", tenantId: "t1" },
        { tenantId: "t1", createdByUserId: "owner-1" },
      ),
    ).toBe(true);
    expect(
      canAccessLeadRecord(
        { userId: "owner-1", role: "owner", platformRole: "user", tenantId: "t1" },
        { tenantId: "t1", createdByUserId: null },
      ),
    ).toBe(true);
    expect(
      canAccessLeadRecord(
        { userId: "owner-1", role: "owner", platformRole: "user", tenantId: "t1" },
        { tenantId: "t1", createdByUserId: "admin-2" },
      ),
    ).toBe(true);
  });

  it("slug admin only sees own scouted leads", () => {
    expect(leadVisibilityForRole("admin", "user")).toBe("own");
    expect(
      canAccessLeadRecord(
        { userId: "admin-1", role: "admin", platformRole: "user", tenantId: "t1" },
        { tenantId: "t1", createdByUserId: "admin-1" },
      ),
    ).toBe(true);
    expect(
      canAccessLeadRecord(
        { userId: "admin-1", role: "admin", platformRole: "user", tenantId: "t1" },
        { tenantId: "t1", createdByUserId: "owner-1" },
      ),
    ).toBe(false);
    expect(
      canAccessLeadRecord(
        { userId: "admin-1", role: "admin", platformRole: "user", tenantId: "t1" },
        { tenantId: "t1", createdByUserId: null },
      ),
    ).toBe(false);
  });

  it("blocks cross-tenant access", () => {
    expect(
      canAccessLeadRecord(
        { userId: "u1", role: "owner", platformRole: "user", tenantId: "t1" },
        { tenantId: "t2", createdByUserId: "u1" },
      ),
    ).toBe(false);
  });
});

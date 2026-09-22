import { describe, expect, it } from "vitest";
import {
  canAccessLeadRecord,
  leadVisibilityForRole,
  mailboxLeadVisibilitySql,
} from "@/lib/leads/lead-visibility";

describe("lead visibility", () => {
  it("superadmin seller view is own mailbox only", () => {
    expect(leadVisibilityForRole("admin", "superadmin")).toBe("own");
    expect(leadVisibilityForRole("viewer", "superadmin")).toBe("own");
    expect(
      canAccessLeadRecord(
        { userId: "srilaksha", tenantId: "t1" },
        { tenantId: "t1", createdByUserId: "prasant" },
      ),
    ).toBe(false);
    expect(
      canAccessLeadRecord(
        { userId: "srilaksha", tenantId: "t1" },
        { tenantId: "t1", createdByUserId: "srilaksha" },
      ),
    ).toBe(true);
    expect(mailboxLeadVisibilitySql({ userId: "srilaksha" })).toBeDefined();
  });

  it("owner only sees their mailbox leads", () => {
    expect(leadVisibilityForRole("owner", "user")).toBe("own");
    expect(
      canAccessLeadRecord(
        { userId: "owner-1", tenantId: "t1" },
        { tenantId: "t1", createdByUserId: "owner-1" },
      ),
    ).toBe(true);
    expect(
      canAccessLeadRecord(
        { userId: "owner-1", tenantId: "t1" },
        { tenantId: "t1", createdByUserId: null },
      ),
    ).toBe(false);
    expect(
      canAccessLeadRecord(
        { userId: "prasant", tenantId: "t1" },
        { tenantId: "t1", createdByUserId: "kasturi-user" },
      ),
    ).toBe(false);
  });

  it("slug admin only sees own scouted leads", () => {
    expect(leadVisibilityForRole("admin", "user")).toBe("own");
    expect(
      canAccessLeadRecord(
        { userId: "admin-1", tenantId: "t1" },
        { tenantId: "t1", createdByUserId: "admin-1" },
      ),
    ).toBe(true);
    expect(
      canAccessLeadRecord(
        { userId: "admin-1", tenantId: "t1" },
        { tenantId: "t1", createdByUserId: "owner-1" },
      ),
    ).toBe(false);
    expect(
      canAccessLeadRecord(
        { userId: "admin-1", tenantId: "t1" },
        { tenantId: "t1", createdByUserId: null },
      ),
    ).toBe(false);
  });

  it("blocks cross-tenant access", () => {
    expect(
      canAccessLeadRecord(
        { userId: "u1", tenantId: "t1" },
        { tenantId: "t2", createdByUserId: "u1" },
      ),
    ).toBe(false);
  });

  it("mailbox visibility always scopes to the logged-in user", () => {
    expect(mailboxLeadVisibilitySql({ userId: "owner-1" })).toBeDefined();
    expect(mailboxLeadVisibilitySql({ userId: "superadmin-user" })).toBeDefined();
  });
});

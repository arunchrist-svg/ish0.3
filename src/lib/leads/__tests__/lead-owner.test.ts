import { describe, expect, it, vi } from "vitest";

const loadWorkspaceEmailOverrides = vi.fn();
const selectLimit = vi.fn();

vi.mock("@/lib/settings/email-settings", () => ({
  loadWorkspaceEmailOverrides: (...args: unknown[]) => loadWorkspaceEmailOverrides(...args),
}));

vi.mock("@/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: (...args: unknown[]) => selectLimit(...args),
        }),
      }),
    }),
  },
  orgMembers: { id: "id", tenantId: "tenant_id", userId: "user_id", status: "status" },
  userEmailSettings: {},
  users: {},
  workspaces: {},
}));

import { resolveLeadOwnerUserId } from "@/lib/leads/lead-owner";

describe("resolveLeadOwnerUserId", () => {
  it("uses the workspace default mailbox owner when that user is an active member", async () => {
    loadWorkspaceEmailOverrides.mockResolvedValue({
      defaultLeadOwnerUserId: "kasturi-user",
    });
    selectLimit.mockResolvedValue([{ id: "membership-1" }]);

    await expect(
      resolveLeadOwnerUserId({
        tenantId: "tenant-1",
        workspaceId: "ws-1",
        fallbackUserId: "prasant-user",
      }),
    ).resolves.toBe("kasturi-user");
  });

  it("falls back to the actor when no default owner is set", async () => {
    loadWorkspaceEmailOverrides.mockResolvedValue({});
    await expect(
      resolveLeadOwnerUserId({
        tenantId: "tenant-1",
        workspaceId: "ws-1",
        fallbackUserId: "prasant-user",
      }),
    ).resolves.toBe("prasant-user");
  });
});

import { describe, expect, it, vi, beforeEach } from "vitest";
import { ForbiddenError } from "@/lib/tenant";

const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockLimit = vi.fn();

vi.mock("@/db", () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
  },
  orgMembers: { role: "role", status: "status", id: "id" },
}));

vi.mock("@/lib/auth/invites", () => ({
  countActiveOwners: vi.fn(),
  assertSeatAvailable: vi.fn(),
}));

import { assertNotLastOwner, generateTempPassword } from "@/lib/auth/org-members";
import { countActiveOwners } from "@/lib/auth/invites";

describe("org-members", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ limit: mockLimit });
  });

  it("generateTempPassword returns 12-char string", () => {
    const pw = generateTempPassword();
    expect(pw).toHaveLength(12);
    expect(pw).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("assertNotLastOwner allows demoting owner when another owner exists", async () => {
    mockLimit.mockResolvedValue([{ role: "owner", status: "active" }]);
    vi.mocked(countActiveOwners).mockResolvedValue(2);

    await expect(assertNotLastOwner("tenant-1", "member-1", "admin")).resolves.toBeUndefined();
  });

  it("assertNotLastOwner blocks removing the sole owner", async () => {
    mockLimit.mockResolvedValue([{ role: "owner", status: "active" }]);
    vi.mocked(countActiveOwners).mockResolvedValue(1);

    await expect(assertNotLastOwner("tenant-1", "member-1")).rejects.toThrow(ForbiddenError);
    await expect(assertNotLastOwner("tenant-1", "member-1")).rejects.toThrow(/last owner/);
  });

  it("assertNotLastOwner blocks demoting the sole owner", async () => {
    mockLimit.mockResolvedValue([{ role: "owner", status: "active" }]);
    vi.mocked(countActiveOwners).mockResolvedValue(1);

    await expect(assertNotLastOwner("tenant-1", "member-1", "admin")).rejects.toThrow(/last owner/);
  });

  it("assertNotLastOwner skips check for non-owner members", async () => {
    mockLimit.mockResolvedValue([{ role: "admin", status: "active" }]);

    await expect(assertNotLastOwner("tenant-1", "member-1")).resolves.toBeUndefined();
    expect(countActiveOwners).not.toHaveBeenCalled();
  });
});

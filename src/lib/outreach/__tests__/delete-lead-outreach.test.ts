import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  selectFromWhere: vi.fn(),
  deleteWhere: vi.fn(),
  updateSetWhere: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: mocks.selectFromWhere,
      })),
    })),
    delete: vi.fn(() => ({
      where: mocks.deleteWhere,
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: mocks.updateSetWhere,
      })),
    })),
  },
  leadOutreach: { id: "id" },
  outreachEditMessages: { leadOutreachId: "leadOutreachId" },
  outreachApprovals: { id: "id", leadOutreachId: "leadOutreachId" },
  outreachSchedule: {
    draftLeadOutreachId: "draftLeadOutreachId",
    approvalId: "approvalId",
  },
}));

vi.mock("drizzle-orm", () => ({
  inArray: vi.fn((col, values) => ({ col, values })),
}));

import { deleteLeadOutreachWhere } from "@/lib/outreach/delete-lead-outreach";

describe("deleteLeadOutreachWhere", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.selectFromWhere
      .mockResolvedValueOnce([{ id: "outreach-1" }, { id: "outreach-2" }])
      .mockResolvedValueOnce([{ id: "approval-1" }]);
    mocks.deleteWhere.mockResolvedValue(undefined);
    mocks.updateSetWhere.mockResolvedValue(undefined);
  });

  it("deletes dependent rows before lead_outreach", async () => {
    await deleteLeadOutreachWhere({} as never);

    expect(mocks.deleteWhere).toHaveBeenCalledTimes(3);
    expect(mocks.updateSetWhere).toHaveBeenCalledTimes(2);
  });

  it("no-ops when no outreach rows match", async () => {
    mocks.selectFromWhere.mockReset();
    mocks.deleteWhere.mockReset();
    mocks.updateSetWhere.mockReset();
    mocks.selectFromWhere.mockResolvedValue([]);

    await deleteLeadOutreachWhere({} as never);

    expect(mocks.deleteWhere).not.toHaveBeenCalled();
    expect(mocks.updateSetWhere).not.toHaveBeenCalled();
  });
});

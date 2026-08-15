import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  deleteWhere: vi.fn(),
  updateWhere: vi.fn(),
  deleteLeadOutreachWhere: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    delete: vi.fn(() => ({
      where: mocks.deleteWhere,
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: mocks.updateWhere,
      })),
    })),
  },
  leads: { id: "id" },
  leadOutreach: { leadId: "leadId" },
  outreachApprovals: { leadId: "leadId" },
  outreachSchedule: { leadId: "leadId" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col, value) => ({ col, value })),
}));

vi.mock("@/lib/outreach/delete-lead-outreach", () => ({
  deleteLeadOutreachWhere: mocks.deleteLeadOutreachWhere,
}));

import { resetLeadOutreach } from "@/lib/outreach/reset-lead-outreach";

describe("resetLeadOutreach", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.deleteWhere.mockResolvedValue(undefined);
    mocks.updateWhere.mockResolvedValue(undefined);
    mocks.deleteLeadOutreachWhere.mockResolvedValue(undefined);
  });

  it("clears schedule, approvals, drafts, and sets researched", async () => {
    await resetLeadOutreach("lead-1");

    expect(mocks.deleteWhere).toHaveBeenCalledTimes(2);
    expect(mocks.deleteLeadOutreachWhere).toHaveBeenCalled();
    expect(mocks.updateWhere).toHaveBeenCalled();
  });
});

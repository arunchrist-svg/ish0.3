import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  deleteWhere: vi.fn(),
  updateWhere: vi.fn(),
  set: vi.fn(),
  deleteLeadOutreachWhere: vi.fn(),
  selectLimit: vi.fn(),
  selectWhere: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: mocks.selectWhere,
      })),
    })),
    delete: vi.fn(() => ({
      where: mocks.deleteWhere,
    })),
    update: vi.fn(() => ({
      set: mocks.set,
    })),
  },
  leads: { id: "id", status: "status", lastReplyContent: "lastReplyContent", lastInboundMessageId: "lastInboundMessageId" },
  leadOutreach: { leadId: "leadId" },
  outreachApprovals: { leadId: "leadId" },
  outreachSchedule: { leadId: "leadId", id: "id", emailKind: "emailKind", sequenceDay: "sequenceDay" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col, value) => ({ op: "eq", col, value })),
  and: vi.fn((...args) => ({ op: "and", args })),
  or: vi.fn((...args) => ({ op: "or", args })),
  not: vi.fn((arg) => ({ op: "not", arg })),
}));

vi.mock("@/lib/outreach/delete-lead-outreach", () => ({
  deleteLeadOutreachWhere: mocks.deleteLeadOutreachWhere,
}));

import { resetLeadOutreach } from "@/lib/outreach/reset-lead-outreach";

describe("resetLeadOutreach", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.selectWhere.mockReturnValue({
      limit: mocks.selectLimit,
    });
    mocks.selectLimit.mockResolvedValue([
      { status: "outreached", lastReplyContent: null, lastInboundMessageId: null },
    ]);
    // second selectWhere call is inbound rows
    mocks.selectWhere
      .mockReturnValueOnce({ limit: mocks.selectLimit })
      .mockResolvedValueOnce([]);
    mocks.deleteWhere.mockResolvedValue(undefined);
    mocks.set.mockReturnValue({ where: mocks.updateWhere });
    mocks.updateWhere.mockResolvedValue(undefined);
    mocks.deleteLeadOutreachWhere.mockResolvedValue(undefined);
  });

  it("clears outbound schedule and keeps researched when no reply", async () => {
    await resetLeadOutreach("lead-1");

    expect(mocks.deleteWhere).toHaveBeenCalled();
    expect(mocks.deleteLeadOutreachWhere).toHaveBeenCalled();
    expect(mocks.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "researched",
        lastReplyContent: null,
        lastInboundMessageId: null,
      }),
    );
  });

  it("keeps replied status and reply fields when a reply exists", async () => {
    mocks.selectLimit.mockResolvedValueOnce([
      {
        status: "replied",
        lastReplyContent: "Yes, send a sample",
        lastInboundMessageId: "<msg-1>",
      },
    ]);
    mocks.selectWhere
      .mockReturnValueOnce({ limit: mocks.selectLimit })
      .mockResolvedValueOnce([{ id: "inbound-1" }]);

    await resetLeadOutreach("lead-1");

    expect(mocks.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "replied",
        lastReplyContent: "Yes, send a sample",
        lastInboundMessageId: "<msg-1>",
      }),
    );
  });
});

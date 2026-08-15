import { describe, expect, it, vi, beforeEach } from "vitest";
import { deriveSequenceState } from "@/lib/outreach/sequence-control";

describe("deriveSequenceState", () => {
  it("returns not_started before email 1 is sent", () => {
    expect(deriveSequenceState("draft_ready", [{ sequenceDay: 1, status: "scheduled" }])).toBe("not_started");
  });

  it("returns active when follow-ups are scheduled", () => {
    expect(
      deriveSequenceState("outreached", [
        { sequenceDay: 0, status: "sent" },
        { sequenceDay: 3, status: "scheduled" },
      ]),
    ).toBe("active");
  });

  it("returns active when follow-ups are pending_review", () => {
    expect(
      deriveSequenceState("outreached", [
        { sequenceDay: 0, status: "sent" },
        { sequenceDay: 3, status: "pending_review" },
      ]),
    ).toBe("active");
  });

  it("returns paused when follow-ups are paused", () => {
    expect(
      deriveSequenceState("outreached", [
        { sequenceDay: 0, status: "sent" },
        { sequenceDay: 3, status: "paused" },
      ]),
    ).toBe("paused");
  });

  it("returns cancelled when follow-ups are cancelled", () => {
    expect(
      deriveSequenceState("outreached", [
        { sequenceDay: 0, status: "sent" },
        { sequenceDay: 3, status: "cancelled" },
        { sequenceDay: 7, status: "cancelled" },
      ]),
    ).toBe("cancelled");
  });

  it("returns complete when lead replied", () => {
    expect(
      deriveSequenceState("replied", [
        { sequenceDay: 0, status: "sent" },
        { sequenceDay: 3, status: "cancelled" },
      ]),
    ).toBe("complete");
  });
});

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  selectWhere: vi.fn(),
  updateWhere: vi.fn(),
  resetLeadOutreach: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    query: {
      leads: { findFirst: mocks.findFirst },
    },
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: mocks.selectWhere,
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: mocks.updateWhere,
      })),
    })),
  },
  leads: { id: "id", tenantId: "tenantId", workspaceId: "workspaceId", status: "status" },
  outreachSchedule: { id: "id", leadId: "leadId", sequenceDay: "sequenceDay", status: "status" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => ({ eq: args })),
  inArray: vi.fn((...args: unknown[]) => ({ inArray: args })),
}));

vi.mock("@/lib/audit", () => ({
  logAudit: mocks.logAudit,
}));

vi.mock("@/lib/outreach/reset-lead-outreach", () => ({
  resetLeadOutreach: mocks.resetLeadOutreach,
}));

import { controlLeadSequence } from "@/lib/outreach/sequence-control";

describe("controlLeadSequence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findFirst.mockResolvedValue({
      id: "lead-1",
      tenantId: "t1",
      workspaceId: "w1",
      status: "outreached",
    });
    mocks.logAudit.mockResolvedValue(undefined);
    mocks.updateWhere.mockResolvedValue(undefined);
    mocks.resetLeadOutreach.mockResolvedValue(undefined);
  });

  it("pauses scheduled and pending_review follow-ups", async () => {
    mocks.selectWhere.mockResolvedValue([
      { id: "s0", sequenceDay: 0, status: "sent" },
      { id: "s1", sequenceDay: 3, status: "scheduled" },
      { id: "s2", sequenceDay: 7, status: "pending_review" },
    ]);

    const result = await controlLeadSequence({
      leadId: "lead-1",
      action: "pause",
      tenantId: "t1",
      workspaceId: "w1",
    });

    expect(result).toEqual({ ok: true, state: "paused", updated: 2 });
    expect(mocks.updateWhere).toHaveBeenCalled();
  });

  it("cancels pending_review follow-ups", async () => {
    mocks.selectWhere.mockResolvedValue([
      { id: "s0", sequenceDay: 0, status: "sent" },
      { id: "s1", sequenceDay: 3, status: "pending_review" },
      { id: "s2", sequenceDay: 7, status: "paused" },
    ]);

    const result = await controlLeadSequence({
      leadId: "lead-1",
      action: "cancel",
      tenantId: "t1",
      workspaceId: "w1",
    });

    expect(result).toEqual({ ok: true, state: "cancelled", updated: 2 });
  });

  it("resets outreach and returns not_started", async () => {
    mocks.selectWhere.mockResolvedValue([
      { id: "s0", sequenceDay: 0, status: "sent" },
      { id: "s1", sequenceDay: 3, status: "scheduled" },
    ]);

    const result = await controlLeadSequence({
      leadId: "lead-1",
      action: "reset",
      tenantId: "t1",
      workspaceId: "w1",
    });

    expect(mocks.resetLeadOutreach).toHaveBeenCalledWith("lead-1");
    expect(result).toEqual({ ok: true, state: "not_started", updated: 2 });
    expect(mocks.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "sequence.reset", entityId: "lead-1" }),
    );
  });
});

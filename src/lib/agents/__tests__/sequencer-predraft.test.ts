import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { zonedLocalToUtc } from "@/lib/email/send-window";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  updateWhere: vi.fn(),
  updateSet: vi.fn(),
  select: vi.fn(),
  runWriter: vi.fn(),
  assertCredits: vi.fn(),
  deductCredits: vi.fn(),
  sendScheduledFollowUp: vi.fn(),
  sendScheduledInitialEmail: vi.fn(),
  evaluateOutreachDraft: vi.fn(),
  getResolvedEmailConfig: vi.fn(),
  isOutreachSendingPaused: vi.fn(() => false),
  claimPayload: null as Record<string, unknown> | null,
}));

vi.mock("@/db", () => ({
  db: {
    select: mocks.select,
    update: () => ({
      set: (values: unknown) => {
        mocks.updateSet(values);
        return {
          where: (...args: unknown[]) => {
            mocks.updateWhere(...args);
            return {
              returning: async () => {
                if (!mocks.claimPayload) return [];
                const row = mocks.claimPayload;
                mocks.claimPayload = null;
                return [row];
              },
            };
          },
        };
      },
    }),
    query: {
      leads: { findFirst: mocks.findFirst },
      leadOutreach: { findFirst: mocks.findFirst },
    },
  },
  outreachSchedule: {
    id: "id",
    scheduledFor: "scheduledFor",
    status: "status",
    sequenceDay: "sequenceDay",
    attemptCount: "attemptCount",
    lastAttemptAt: "lastAttemptAt",
    lastError: "lastError",
  },
  leads: {},
  contacts: {},
  accounts: {},
  leadOutreach: {},
  leadResearch: {},
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  lte: vi.fn(),
  and: vi.fn((...args: unknown[]) => args),
  or: vi.fn(),
  asc: vi.fn(),
  isNull: vi.fn(),
  sql: vi.fn((...args: unknown[]) => ({ __sql: args })),
  notInArray: vi.fn(),
}));

vi.mock("@/lib/outreach/reschedule-initial-queue", () => ({
  rollAllDueQueuesOutsideWindow: vi.fn(async () => 0),
  rollDueInitialQueueIfOutsideWindow: vi.fn(async () => null),
}));
vi.mock("@/lib/billing/credits", () => ({
  assertCredits: mocks.assertCredits,
  deductCredits: mocks.deductCredits,
  InsufficientCreditsError: class extends Error {},
}));
vi.mock("@/lib/billing/entitlements", () => ({ assertPlanEntitlement: vi.fn() }));
vi.mock("@/lib/settings/email-settings", () => ({
  getResolvedEmailConfig: (...args: unknown[]) => mocks.getResolvedEmailConfig(...args),
}));
vi.mock("@/lib/email/config", async () => {
  const actual = await vi.importActual<typeof import("@/lib/email/config")>("@/lib/email/config");
  return {
    ...actual,
    isOutreachSendingPaused: (...args: unknown[]) => mocks.isOutreachSendingPaused(...args),
  };
});
vi.mock("@/lib/email/sender-preflight", () => ({
  assertSenderPreflight: vi.fn(),
  SenderPreflightError: class extends Error {
    issues: { label: string }[];
    constructor(issues: { label: string }[] = []) {
      super(issues.map((i) => i.label).join("; "));
      this.issues = issues;
    }
  },
}));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/push/notify-workspace", () => ({ notifyLeadEvent: vi.fn() }));
vi.mock("@/lib/agents/quality-gate", () => ({
  evaluateOutreachDraft: mocks.evaluateOutreachDraft,
}));
vi.mock("@/lib/outreach/send-scheduled-followup", () => ({
  sendScheduledFollowUp: mocks.sendScheduledFollowUp,
  FollowUpQualityError: class extends Error {},
}));
vi.mock("@/lib/outreach/send-scheduled-initial", () => ({
  sendScheduledInitialEmail: mocks.sendScheduledInitialEmail,
}));

import { runSequencer, SEQUENCER_MAX_ATTEMPTS } from "@/lib/agents/sequencer";

const IST = "Asia/Kolkata";

const defaultEmailConfig = {
  sendMode: "dry_run",
  fromAddress: "test@ish.local",
  cadenceDays: [3, 7],
  emailStyle: "plain",
  appUrl: "http://localhost",
  followUpPolicy: "auto_send",
  sendDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
  sendHourStart: 6,
  sendHourEnd: 20,
  sendTimezone: "UTC",
};

function dueRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "sched-1",
    leadId: "lead-1",
    sequenceDay: 3,
    status: "scheduled",
    scheduledFor: new Date(Date.now() - 1000),
    trackingToken: "tok",
    draftLeadOutreachId: "draft-2",
    attemptCount: 0,
    lastAttemptAt: null,
    lastError: null,
    emailKind: null,
    ...overrides,
  };
}

function queueDue(rows: Record<string, unknown>[]) {
  let calls = 0;
  mocks.select.mockImplementation(() => ({
    from: () => ({
      where: () => ({
        orderBy: () => ({
          limit: async () => {
            calls += 1;
            return calls === 1 ? rows : [];
          },
        }),
      }),
    }),
  }));
}

function prepareClaim(row: Record<string, unknown>, attemptCount = 1) {
  mocks.claimPayload = { ...row, status: "sending", attemptCount };
}

describe("runSequencer pre-linked drafts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.claimPayload = null;
    mocks.isOutreachSendingPaused.mockReturnValue(false);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-24T12:00:00.000Z"));
    mocks.getResolvedEmailConfig.mockResolvedValue(defaultEmailConfig);
    queueDue([dueRow()]);
    prepareClaim(dueRow(), 1);
    mocks.findFirst
      .mockResolvedValueOnce({
        id: "lead-1",
        status: "outreached",
        tenantId: "t1",
        workspaceId: "w1",
        contact: { name: "Alex", email: "a@b.com", firstName: "Alex", title: "HR" },
        account: { name: "Acme", industry: "Tech", city: "Mumbai" },
        research: null,
      })
      .mockResolvedValueOnce({
        id: "draft-2",
        subjectA: "Re: Hi",
        emailBody: "Follow up body",
        sequencePosition: 2,
        revisionTimeout: false,
      });
    mocks.evaluateOutreachDraft.mockResolvedValue({
      delivScore: 90,
      rubricTotal: 90,
      passes: true,
      revisionTimeoutRisk: false,
    });
    mocks.sendScheduledFollowUp.mockResolvedValue({
      messageId: "msg-1",
      mode: "dry_run",
      outreachId: "draft-2",
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("claims then sends linked draft without calling runWriter", async () => {
    const result = await runSequencer();
    expect(result.processed).toBe(1);
    expect(mocks.runWriter).not.toHaveBeenCalled();
    expect(mocks.sendScheduledFollowUp).toHaveBeenCalledWith({
      scheduleId: "sched-1",
      tenantId: "t1",
      workspaceId: "w1",
    });
    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "sending",
        lastError: null,
      }),
    );
  });

  it("routes to pending_review when follow-up policy requires review", async () => {
    mocks.getResolvedEmailConfig.mockResolvedValue({
      ...defaultEmailConfig,
      followUpPolicy: "review_all_followups",
    });

    const result = await runSequencer();
    expect(result.pendingReview).toBe(1);
    expect(result.processed).toBe(0);
    expect(mocks.sendScheduledFollowUp).not.toHaveBeenCalled();
    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "pending_review",
        lastError: "Follow-up requires review",
      }),
    );
  });

  it("defers due rows outside Shoot-to window without sending", async () => {
    const outside = zonedLocalToUtc({ year: 2026, month: 8, day: 21, hour: 18, minute: 30 }, IST);
    vi.setSystemTime(outside);

    queueDue([dueRow()]);
    prepareClaim(dueRow(), 1);

    mocks.getResolvedEmailConfig.mockResolvedValue({
      ...defaultEmailConfig,
      sendDaysOfWeek: [1, 2, 3, 4, 5],
      sendHourStart: 9,
      sendHourEnd: 17,
      sendTimezone: IST,
    });

    mocks.findFirst.mockReset();
    mocks.findFirst.mockResolvedValueOnce({
      id: "lead-1",
      status: "outreached",
      tenantId: "t1",
      workspaceId: "w1",
      contact: { name: "Alex", email: "a@b.com", firstName: "Alex", title: "HR" },
      account: { name: "Acme", industry: "Tech", city: "Mumbai" },
      research: null,
    });

    const result = await runSequencer();
    expect(result.processed).toBe(0);
    expect(result.skipped).toBe(1);
    expect(mocks.sendScheduledFollowUp).not.toHaveBeenCalled();
    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "scheduled",
        lastError: null,
        scheduledFor: zonedLocalToUtc({ year: 2026, month: 8, day: 24, hour: 9, minute: 0 }, IST),
      }),
    );
  });

  it("writes lastError and returns to scheduled on soft failure under max attempts", async () => {
    prepareClaim(dueRow({ attemptCount: 0 }), 0);
    mocks.sendScheduledFollowUp.mockRejectedValueOnce(new Error("Resend timeout"));

    const result = await runSequencer();
    expect(result.processed).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.failed).toBe(0);
    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "scheduled",
        attemptCount: 1,
        lastError: "Resend timeout",
      }),
    );
  });

  it("flips to failed after max attempts", async () => {
    prepareClaim(dueRow({ attemptCount: SEQUENCER_MAX_ATTEMPTS - 1 }), SEQUENCER_MAX_ATTEMPTS - 1);
    mocks.sendScheduledFollowUp.mockRejectedValueOnce(new Error("Hard boom"));

    const result = await runSequencer();
    expect(result.failed).toBe(1);
    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        attemptCount: SEQUENCER_MAX_ATTEMPTS,
        lastError: "Hard boom",
      }),
    );
  });

  it("leaves a reason when outreach sending is paused", async () => {
    mocks.isOutreachSendingPaused.mockReturnValue(true);

    const result = await runSequencer();
    expect(result.skipped).toBe(1);
    expect(result.processed).toBe(0);
    expect(mocks.sendScheduledFollowUp).not.toHaveBeenCalled();
    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "scheduled",
        lastError: "Outbox sending is paused",
      }),
    );
  });
});

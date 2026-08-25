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
  evaluateOutreachDraft: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    select: mocks.select,
    update: () => ({
      set: (values: unknown) => {
        mocks.updateSet(values);
        return { where: mocks.updateWhere };
      },
    }),
    query: {
      leads: { findFirst: mocks.findFirst },
      leadOutreach: { findFirst: mocks.findFirst },
    },
  },
  outreachSchedule: { id: "id", scheduledFor: "scheduledFor", status: "status", sequenceDay: "sequenceDay" },
  leads: {},
  contacts: {},
  accounts: {},
  leadOutreach: {},
  leadResearch: {},
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  lte: vi.fn(),
  and: vi.fn(),
}));

vi.mock("@/lib/agents/writer", () => ({ runWriter: mocks.runWriter }));
vi.mock("@/lib/billing/credits", () => ({
  assertCredits: mocks.assertCredits,
  deductCredits: mocks.deductCredits,
  InsufficientCreditsError: class extends Error {},
}));
vi.mock("@/lib/billing/entitlements", () => ({ assertPlanEntitlement: vi.fn() }));
vi.mock("@/lib/settings/email-settings", () => ({
  getResolvedEmailConfig: vi.fn().mockResolvedValue({
    sendMode: "dry_run",
    fromAddress: "test@ish.local",
    cadenceDays: [3, 7],
    emailStyle: "plain",
    appUrl: "http://localhost",
    followUpPolicy: "auto_send",
    // Always-open window so clock time does not flake send-path tests.
    sendDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    sendHourStart: 0,
    sendHourEnd: 24,
    sendTimezone: "UTC",
  }),
}));
vi.mock("@/lib/email/sender-preflight", () => ({ assertSenderPreflight: vi.fn(), SenderPreflightError: class extends Error {} }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/push/notify-workspace", () => ({ notifyLeadEvent: vi.fn() }));
vi.mock("@/lib/agents/quality-gate", () => ({
  evaluateOutreachDraft: mocks.evaluateOutreachDraft,
}));
vi.mock("@/lib/outreach/send-scheduled-followup", () => ({
  sendScheduledFollowUp: mocks.sendScheduledFollowUp,
  FollowUpQualityError: class extends Error {},
}));

import { runSequencer } from "@/lib/agents/sequencer";

const IST = "Asia/Kolkata";

describe("runSequencer pre-linked drafts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.select.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: async () => [
            {
              id: "sched-1",
              leadId: "lead-1",
              sequenceDay: 3,
              status: "scheduled",
              scheduledFor: new Date(Date.now() - 1000),
              trackingToken: "tok",
              draftLeadOutreachId: "draft-2",
            },
          ],
        }),
      }),
    });
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

  it("sends linked draft without calling runWriter", async () => {
    const result = await runSequencer();
    expect(result.processed).toBe(1);
    expect(mocks.runWriter).not.toHaveBeenCalled();
    expect(mocks.sendScheduledFollowUp).toHaveBeenCalledWith({
      scheduleId: "sched-1",
      tenantId: "t1",
      workspaceId: "w1",
    });
  });

  it("routes to pending_review when follow-up policy requires review", async () => {
    const { getResolvedEmailConfig } = await import("@/lib/settings/email-settings");
    vi.mocked(getResolvedEmailConfig).mockResolvedValue({
      sendMode: "dry_run",
      fromAddress: "test@ish.local",
      cadenceDays: [3, 7],
      emailStyle: "plain",
      appUrl: "http://localhost",
      followUpPolicy: "review_all_followups",
      sendDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      sendHourStart: 0,
      sendHourEnd: 24,
      sendTimezone: "UTC",
    } as never);

    const result = await runSequencer();
    expect(result.pendingReview).toBe(1);
    expect(result.processed).toBe(0);
    expect(mocks.sendScheduledFollowUp).not.toHaveBeenCalled();
  });

  it("defers due rows outside Shoot-to window without sending", async () => {
    // Friday 2026-08-21 18:30 IST (after 17:00 Mon–Fri window)
    const outside = zonedLocalToUtc({ year: 2026, month: 8, day: 21, hour: 18, minute: 30 }, IST);
    vi.useFakeTimers();
    vi.setSystemTime(outside);

    const { getResolvedEmailConfig } = await import("@/lib/settings/email-settings");
    vi.mocked(getResolvedEmailConfig).mockResolvedValue({
      sendMode: "dry_run",
      fromAddress: "test@ish.local",
      cadenceDays: [3, 7],
      emailStyle: "plain",
      appUrl: "http://localhost",
      followUpPolicy: "auto_send",
      sendDaysOfWeek: [1, 2, 3, 4, 5],
      sendHourStart: 9,
      sendHourEnd: 17,
      sendTimezone: IST,
    } as never);

    const result = await runSequencer();
    expect(result.processed).toBe(0);
    expect(result.skipped).toBe(1);
    expect(mocks.sendScheduledFollowUp).not.toHaveBeenCalled();
    expect(mocks.updateSet).toHaveBeenCalledWith({
      scheduledFor: zonedLocalToUtc({ year: 2026, month: 8, day: 24, hour: 9, minute: 0 }, IST),
    });
  });
});

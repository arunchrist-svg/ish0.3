import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  update: vi.fn(),
  select: vi.fn(),
  sendEmail: vi.fn(),
  runWriter: vi.fn(),
  assertCredits: vi.fn(),
  deductCredits: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    select: mocks.select,
    update: () => ({ set: () => ({ where: mocks.update }) }),
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
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  lte: vi.fn(),
  and: vi.fn(),
}));

vi.mock("@/lib/email/email-sender", () => ({ sendEmail: mocks.sendEmail }));
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
  }),
}));
vi.mock("@/lib/email/sender-preflight", () => ({ assertSenderPreflight: vi.fn(), SenderPreflightError: class extends Error {} }));
vi.mock("@/lib/email/thread-context", () => ({
  loadThreadContext: vi.fn().mockResolvedValue({ rootSubject: "Hi", rootMessageId: "<r>", referencesChain: "" }),
  resolveOutboundSubject: vi.fn().mockReturnValue("Re: Hi"),
  resolveThreadHeaders: vi.fn().mockReturnValue({ inReplyTo: "<r>", references: "<r>" }),
}));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));

import { runSequencer } from "@/lib/agents/sequencer";

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
        contact: { email: "a@b.com" },
        account: { name: "Acme" },
      })
      .mockResolvedValueOnce({
        id: "draft-2",
        subjectA: "Re: Hi",
        emailBody: "Follow up body",
      });
    mocks.sendEmail.mockResolvedValue({ mode: "dry_run", messageId: "msg-1", subject: "Re: Hi", to: "a@b.com" });
  });

  it("sends linked draft without calling runWriter", async () => {
    const result = await runSequencer();
    expect(result.processed).toBe(1);
    expect(mocks.runWriter).not.toHaveBeenCalled();
    expect(mocks.sendEmail).toHaveBeenCalled();
  });
});

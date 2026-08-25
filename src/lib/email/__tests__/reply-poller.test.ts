import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  getResolvedEmailConfig: vi.fn(),
  persistEmailConfig: vi.fn(),
  listReceivedEmails: vi.fn(),
  getReceivedEmail: vi.fn(),
  processLeadReply: vi.fn(),
}));

function createQuery(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  const next = () => chain;
  chain.from = vi.fn(next);
  chain.innerJoin = vi.fn(next);
  chain.leftJoin = vi.fn(next);
  chain.where = vi.fn(next);
  chain.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve(rows).then(resolve, reject);
  return chain;
}

vi.mock("@/db", () => ({
  db: {
    select: (...args: unknown[]) => mocks.select(...args),
  },
  leads: { id: "id", tenantId: "tenantId", workspaceId: "workspaceId", status: "status", contactId: "contactId" },
  contacts: { id: "id", email: "email", alternateEmails: "alternateEmails" },
  outreachSchedule: { leadId: "leadId", sentAt: "sentAt", recipientEmail: "recipientEmail", status: "status" },
  workspaceSettings: { workspaceId: "workspaceId" },
}));

vi.mock("imapflow", () => ({
  ImapFlow: vi.fn(),
}));

vi.mock("@/lib/settings/email-settings", () => ({
  getResolvedEmailConfig: (...args: unknown[]) => mocks.getResolvedEmailConfig(...args),
  persistEmailConfig: (...args: unknown[]) => mocks.persistEmailConfig(...args),
  persistWorkspaceEmailConfig: (...args: unknown[]) => mocks.persistEmailConfig(...args),
  persistUserEmailConfig: (...args: unknown[]) => mocks.persistEmailConfig(...args),
  listWorkspaceUserEmailSettings: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/email/resend-receiving", () => ({
  listReceivedEmails: (...args: unknown[]) => mocks.listReceivedEmails(...args),
  getReceivedEmail: (...args: unknown[]) => mocks.getReceivedEmail(...args),
}));

vi.mock("@/lib/email/process-reply", () => ({
  processLeadReply: (...args: unknown[]) => mocks.processLeadReply(...args),
}));

import { pollRepliesForWorkspace } from "@/lib/email/reply-poller";
import { repliesCapability } from "@/lib/email/replies-capability";

const watchRow = {
  leadId: "lead-1",
  tenantId: "t1",
  workspaceId: "ws1",
  contactEmail: "ops@acme.com",
  recipientEmail: "prasantmishra@indiasweethouse.in",
  alternateEmails: [{ email: "buying@acme.com", emailStatus: "unverified" }],
  firstSentAt: new Date("2026-08-01T00:00:00.000Z"),
};

describe("pollRepliesForWorkspace resend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.persistEmailConfig.mockResolvedValue(undefined);
    mocks.processLeadReply.mockResolvedValue({ ok: true });
    mocks.getReceivedEmail.mockResolvedValue({
      id: "email_1",
      from: "prasantmishra@indiasweethouse.in",
      text: "Please send the festive tasting box.",
    });
    mocks.select.mockReturnValue(createQuery([watchRow]));
  });

  it("polls Resend Receiving when the workspace provider is resend", async () => {
    mocks.getResolvedEmailConfig.mockResolvedValue({
      provider: "resend",
      resendApiKey: "re_test",
      processedReplyMessageIds: [],
    });
    mocks.listReceivedEmails.mockResolvedValue({
      hasMore: false,
      data: [
        {
          id: "email_1",
          from: "Prasanth <prasantmishra@indiasweethouse.in>",
          created_at: new Date().toISOString(),
          message_id: "<msg-1>",
        },
      ],
    });

    const result = await pollRepliesForWorkspace("ws1");

    expect(result.provider).toBe("resend");
    expect(result.checked).toBe(1);
    expect(result.matched).toBe(1);
    expect(result.processed).toBe(1);
    expect(mocks.listReceivedEmails).toHaveBeenCalledWith("re_test", expect.objectContaining({ limit: 100 }));
    expect(mocks.getReceivedEmail).toHaveBeenCalledWith("email_1", "re_test");
    expect(mocks.processLeadReply).toHaveBeenCalledWith(
      expect.objectContaining({
        leadId: "lead-1",
        source: "resend_poll",
        inboundMessageId: "email_1",
        replyContent: "Please send the festive tasting box.",
      }),
    );
    expect(mocks.persistEmailConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        processedReplyMessageIds: expect.arrayContaining(["email_1", "<msg-1>"]),
      }),
      "ws1",
    );
  });

  it("skips already processed inbound message ids", async () => {
    mocks.getResolvedEmailConfig.mockResolvedValue({
      provider: "resend",
      resendApiKey: "re_test",
      processedReplyMessageIds: ["email_1"],
    });
    mocks.listReceivedEmails.mockResolvedValue({
      hasMore: false,
      data: [
        {
          id: "email_1",
          from: "prasantmishra@indiasweethouse.in",
          created_at: new Date().toISOString(),
        },
      ],
    });

    const result = await pollRepliesForWorkspace("ws1");
    expect(result.skipped).toBe(1);
    expect(result.processed).toBe(0);
    expect(mocks.getReceivedEmail).not.toHaveBeenCalled();
    expect(mocks.processLeadReply).not.toHaveBeenCalled();
  });

  it("matches alternateEmails when From is not the primary contact email", async () => {
    mocks.select.mockReturnValue(
      createQuery([
        {
          ...watchRow,
          contactEmail: "ops@acme.com",
          recipientEmail: "ops@acme.com",
          alternateEmails: [{ email: "prasantmishra@indiasweethouse.in", emailStatus: "unverified" }],
        },
      ]),
    );
    mocks.getResolvedEmailConfig.mockResolvedValue({
      provider: "resend",
      resendApiKey: "re_test",
      processedReplyMessageIds: [],
    });
    mocks.listReceivedEmails.mockResolvedValue({
      hasMore: false,
      data: [
        {
          id: "email_alt",
          from: "prasantmishra@indiasweethouse.in",
          created_at: new Date().toISOString(),
        },
      ],
    });
    mocks.getReceivedEmail.mockResolvedValue({
      id: "email_alt",
      from: "prasantmishra@indiasweethouse.in",
      text: "We can taste a box next week.",
    });

    const result = await pollRepliesForWorkspace("ws1");
    expect(result.processed).toBe(1);
    expect(mocks.processLeadReply).toHaveBeenCalledWith(expect.objectContaining({ leadId: "lead-1" }));
  });

  it("does not list Resend Receiving for smtp workspaces", async () => {
    mocks.getResolvedEmailConfig.mockResolvedValue({
      provider: "smtp",
      smtpUser: "",
      smtpPass: "",
    });
    mocks.select.mockReturnValue(createQuery([]));

    const result = await pollRepliesForWorkspace("ws1");
    expect(result.provider).toBe("smtp");
    expect(mocks.listReceivedEmails).not.toHaveBeenCalled();
  });

  it("errors when Resend has no API key", async () => {
    mocks.getResolvedEmailConfig.mockResolvedValue({
      provider: "resend",
      resendApiKey: "",
      processedReplyMessageIds: [],
    });
    const prev = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;

    const result = await pollRepliesForWorkspace("ws1");
    expect(result.errors[0]).toBe("Resend API key not configured");
    expect(mocks.listReceivedEmails).not.toHaveBeenCalled();

    process.env.RESEND_API_KEY = prev;
  });
});

describe("repliesCapability", () => {
  it("describes Resend Receiving instead of Gmail-only IMAP", () => {
    expect(repliesCapability({ provider: "resend" }).hint).toMatch(/Resend Receiving/);
    expect(repliesCapability({ provider: "smtp" }).hint).toMatch(/IMAP/);
  });
});

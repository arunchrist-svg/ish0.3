import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  processLeadReply: vi.fn(),
  getResolvedEmailConfig: vi.fn(),
  getReceivedEmail: vi.fn(),
}));

function createQuery(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  const next = () => chain;
  chain.from = vi.fn(next);
  chain.innerJoin = vi.fn(next);
  chain.leftJoin = vi.fn(next);
  chain.where = vi.fn(next);
  chain.orderBy = vi.fn(next);
  chain.limit = vi.fn(next);
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
  outreachSchedule: { leadId: "leadId", sentAt: "sentAt", recipientEmail: "recipientEmail" },
}));

vi.mock("@/lib/email/process-reply", () => ({
  processLeadReply: (...args: unknown[]) => mocks.processLeadReply(...args),
}));

vi.mock("@/lib/settings/email-settings", () => ({
  getResolvedEmailConfig: (...args: unknown[]) => mocks.getResolvedEmailConfig(...args),
}));

vi.mock("@/lib/email/resend-receiving", () => ({
  getReceivedEmail: (...args: unknown[]) => mocks.getReceivedEmail(...args),
}));

import { inboundFromMatchSql, processResendInboundEvent } from "@/lib/email/process-inbound";

describe("processResendInboundEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.processLeadReply.mockResolvedValue({ ok: true });
    mocks.getResolvedEmailConfig.mockResolvedValue({ resendApiKey: "re_ws" });
    mocks.getReceivedEmail.mockResolvedValue(null);
  });

  it("skips non-inbound events", async () => {
    const result = await processResendInboundEvent({ type: "email.delivered", data: { from: "a@b.com" } });
    expect(result).toEqual({ ok: true, skipped: true, reason: "ignored_event" });
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("matches recipientEmail and alternateEmails in SQL", () => {
    const serialized = JSON.stringify(inboundFromMatchSql("prasantmishra@indiasweethouse.in"));
    expect(serialized).toContain("recipientEmail");
    expect(serialized).toContain("alternateEmails");
    expect(serialized).toContain("jsonb_array_elements");
  });

  it("applies a matched inbound reply", async () => {
    mocks.select.mockReturnValue(
      createQuery([
        { leadId: "lead-1", tenantId: "t1", workspaceId: "ws1", status: "outreached" },
      ]),
    );

    const result = await processResendInboundEvent({
      type: "email.received",
      data: {
        email_id: "email_1",
        from: "Prasanth <prasantmishra@indiasweethouse.in>",
        text: "Please send a sample box.",
      },
    });

    expect(result).toEqual({ ok: true, leadId: "lead-1" });
    expect(mocks.getReceivedEmail).not.toHaveBeenCalled();
    expect(mocks.processLeadReply).toHaveBeenCalledWith(
      expect.objectContaining({
        leadId: "lead-1",
        source: "resend_inbound",
        inboundMessageId: "email_1",
        replyContent: "Please send a sample box.",
      }),
    );
  });

  it("fetches receiving get when the webhook has no body", async () => {
    mocks.select.mockReturnValue(
      createQuery([
        { leadId: "lead-1", tenantId: "t1", workspaceId: "ws1", status: "outreached" },
      ]),
    );
    mocks.getReceivedEmail.mockResolvedValue({
      id: "email_1",
      from: "prasantmishra@indiasweethouse.in",
      text: "Yes, send the festive tasting box.",
      html: null,
    });

    const result = await processResendInboundEvent({
      type: "email.received",
      data: {
        email_id: "email_1",
        from: "prasantmishra@indiasweethouse.in",
      },
    });

    expect(result).toEqual({ ok: true, leadId: "lead-1" });
    expect(mocks.getResolvedEmailConfig).toHaveBeenCalledWith("ws1");
    expect(mocks.getReceivedEmail).toHaveBeenCalledWith("email_1", "re_ws");
    expect(mocks.processLeadReply).toHaveBeenCalledWith(
      expect.objectContaining({
        leadId: "lead-1",
        replyContent: "Yes, send the festive tasting box.",
      }),
    );
  });

  it("skips when no watch lead matches", async () => {
    mocks.select.mockReturnValue(createQuery([]));
    const result = await processResendInboundEvent({
      type: "email.inbound",
      data: { from: "unknown@example.com", email_id: "email_x" },
    });
    expect(result.reason).toBe("lead_not_found");
    expect(mocks.getReceivedEmail).not.toHaveBeenCalled();
    expect(mocks.processLeadReply).not.toHaveBeenCalled();
  });
});

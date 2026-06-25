import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { getDefaultEmailConfig, resolveEmailConfig } from "@/lib/email/config";

const smtpSend = vi.fn();
const resendSend = vi.fn();
const getResolvedEmailConfig = vi.fn();

vi.mock("@/lib/settings/email-settings", () => ({
  getResolvedEmailConfig: (...args: unknown[]) => getResolvedEmailConfig(...args),
}));

vi.mock("@/lib/email/smtp-transport", () => ({
  smtpTransport: {
    name: "smtp",
    getStatus: vi.fn(),
    verify: vi.fn(),
    send: (...args: unknown[]) => smtpSend(...args),
  },
}));

vi.mock("@/lib/email/resend-transport", () => ({
  resendTransport: {
    name: "resend",
    getStatus: vi.fn(),
    verify: vi.fn(),
    send: (...args: unknown[]) => resendSend(...args),
  },
}));

vi.mock("@/lib/tenant", () => ({
  requireTenantContext: vi.fn().mockResolvedValue({ workspaceId: "ws-test" }),
}));

import { sendEmail, invalidateEmailConfigCache } from "@/lib/email/email-sender";

const ORIGINAL_ENV = process.env;

function smtpConfig(overrides: Record<string, unknown> = {}) {
  return resolveEmailConfig({
    ...getDefaultEmailConfig(),
    provider: "smtp",
    smtpHost: "smtp.gmail.com",
    smtpPort: 587,
    smtpSecure: false,
    smtpUser: "sender@gmail.com",
    smtpPass: "app-password",
    fromAddress: "sender@gmail.com",
    sendMode: "test",
    testRecipient: "test@example.com",
    ...overrides,
  });
}

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.clearAllMocks();
  invalidateEmailConfigCache();
  smtpSend.mockResolvedValue({
    mode: "test",
    provider: "smtp",
    messageId: "smtp-msg-1",
    to: "test@example.com",
    subject: "Hi",
    timestamp: "2026-01-01T00:00:00.000Z",
  });
  resendSend.mockResolvedValue({
    mode: "live",
    provider: "resend",
    messageId: "re-msg-1",
    to: "lead@example.com",
    subject: "Hi",
    timestamp: "2026-01-01T00:00:00.000Z",
  });
});

afterEach(() => {
  process.env = ORIGINAL_ENV;
});

describe("sendEmail", () => {
  it("dry_run does not call any transport", async () => {
    getResolvedEmailConfig.mockResolvedValue(smtpConfig({ sendMode: "dry_run" }));
    const result = await sendEmail({ to: "lead@example.com", subject: "Hi", html: "<p>hi</p>" });
    expect(result.mode).toBe("dry_run");
    expect(smtpSend).not.toHaveBeenCalled();
    expect(resendSend).not.toHaveBeenCalled();
  });

  it("test mode sends to test recipient, not the lead address", async () => {
    getResolvedEmailConfig.mockResolvedValue(smtpConfig());
    await sendEmail({ to: "lead@example.com", subject: "Hi", html: "<p>hi</p>" });
    expect(smtpSend).toHaveBeenCalledOnce();
    const to = smtpSend.mock.calls[0][2] as string;
    expect(to).toBe("test@example.com");
    expect(to).not.toBe("lead@example.com");
  });

  it("test mode throws when test recipient is missing", async () => {
    getResolvedEmailConfig.mockResolvedValue(smtpConfig({ testRecipient: "" }));
    await expect(
      sendEmail({ to: "lead@example.com", subject: "Hi", html: "<p>hi</p>" }),
    ).rejects.toThrow(/Test recipient/);
    expect(smtpSend).not.toHaveBeenCalled();
  });

  it("dispatches to smtp transport when provider is smtp", async () => {
    getResolvedEmailConfig.mockResolvedValue(smtpConfig({ sendMode: "live" }));
    await sendEmail({ to: "lead@example.com", subject: "Hi", html: "<p>hi</p>" });
    expect(smtpSend).toHaveBeenCalledOnce();
    expect(resendSend).not.toHaveBeenCalled();
    const to = smtpSend.mock.calls[0][2] as string;
    expect(to).toBe("lead@example.com");
  });

  it("dispatches to resend transport when provider is resend", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    getResolvedEmailConfig.mockResolvedValue(
      resolveEmailConfig({
        ...getDefaultEmailConfig(),
        provider: "resend",
        sendMode: "live",
        fromAddress: "sender@example.com",
      }),
    );
    await sendEmail({ to: "lead@example.com", subject: "Hi", html: "<p>hi</p>" });
    expect(resendSend).toHaveBeenCalledOnce();
    expect(smtpSend).not.toHaveBeenCalled();
  });
});

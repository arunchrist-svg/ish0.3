import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  getDefaultEmailConfig,
  resolveEmailConfig,
  validateEmailConfig,
  isOutreachSendingPaused,
  OUTREACH_PAUSED_MESSAGE,
  fromAddressMatchesSmtpUser,
  resolveSmtpCredentials,
} from "@/lib/email/config";

const ORIGINAL_ENV = process.env;

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

afterEach(() => {
  process.env = ORIGINAL_ENV;
});

describe("resolveEmailConfig", () => {
  it("merges overrides and clamps cadence days", () => {
    const resolved = resolveEmailConfig({
      cadenceDays: [0, 5],
      fromName: "Custom Team",
    });

    expect(resolved.cadenceDays[0]).toBe(1);
    expect(resolved.cadenceDays[1]).toBeGreaterThan(resolved.cadenceDays[0]);
    expect(resolved.fromName).toBe("Custom Team");
  });

  it("defaults provider to smtp", () => {
    delete process.env.EMAIL_PROVIDER;
    const resolved = resolveEmailConfig({});
    expect(resolved.provider).toBe("smtp");
  });

  it("reads EMAIL_TEST_RECIPIENT with RESEND fallback", () => {
    process.env.EMAIL_TEST_RECIPIENT = "test@example.com";
    const resolved = resolveEmailConfig({});
    expect(resolved.testRecipient).toBe("test@example.com");
  });

  it("prefers settings smtp credentials over env", () => {
    process.env.SMTP_USER = "env@gmail.com";
    process.env.SMTP_PASS = "env-pass";
    const resolved = resolveEmailConfig({
      smtpUser: "settings@gmail.com",
      smtpPass: "settings-pass",
    });
    const creds = resolveSmtpCredentials(resolved);
    expect(creds.user).toBe("settings@gmail.com");
    expect(creds.pass).toBe("settings-pass");
  });
});

describe("validateEmailConfig", () => {
  const base = {
    ...getDefaultEmailConfig(),
    provider: "smtp" as const,
    sendMode: "dry_run" as const,
    testRecipient: "",
    smtpHost: "smtp.gmail.com",
    smtpPort: 587,
    smtpSecure: false,
    smtpUser: "",
    smtpPass: "",
  };

  it("requires test recipient in test mode", () => {
    const errors = validateEmailConfig({ ...base, sendMode: "test", testRecipient: "" });
    expect(errors).toContain("Test recipient is required when send mode is Test");
  });

  it("blocks live mode when SMTP is not verified", () => {
    const errors = validateEmailConfig(
      { ...base, sendMode: "live" },
      { smtpVerified: false },
    );
    expect(errors.some((e) => e.includes("verified"))).toBe(true);
  });

  it("blocks from address mismatch with smtp email", () => {
    const config = {
      ...base,
      smtpUser: "sender@company.com",
      smtpPass: "secret",
      fromAddress: "other@company.com",
    };

    const errors = validateEmailConfig(config);

    expect(errors.some((e) => e.includes("SMTP email"))).toBe(true);
    expect(fromAddressMatchesSmtpUser(config)).toBe(false);
  });

  it("requires test recipient at send time in test mode", () => {
    const errors = validateEmailConfig(
      { ...base, sendMode: "test", testRecipient: "" },
      { forSend: true, smtpVerified: true },
    );
    expect(errors.some((e) => e.includes("Test recipient"))).toBe(true);
  });
});

describe("EMAIL-UNIT-001 additional config cases", () => {
  it("reads resend provider from env", () => {
    process.env.EMAIL_PROVIDER = "resend";
    const resolved = resolveEmailConfig({});
    expect(resolved.provider).toBe("resend");
  });

  it("defaults outreach sending to active (not paused)", () => {
    const resolved = resolveEmailConfig({});
    expect(resolved.outreachPaused).toBe(false);
    expect(isOutreachSendingPaused(resolved)).toBe(false);
  });

  it("respects outreachPaused override", () => {
    const paused = resolveEmailConfig({ outreachPaused: true });
    expect(isOutreachSendingPaused(paused)).toBe(true);
    expect(OUTREACH_PAUSED_MESSAGE).toMatch(/paused/i);
  });

  it("clamps single cadence day to minimum of 1", () => {
    const resolved = resolveEmailConfig({ cadenceDays: [0, 7] });
    expect(resolved.cadenceDays[0]).toBe(1);
  });

  it("uses RESEND_TEST_RECIPIENT as fallback", () => {
    delete process.env.EMAIL_TEST_RECIPIENT;
    process.env.RESEND_TEST_RECIPIENT = "resend-test@example.com";
    const resolved = resolveEmailConfig({});
    expect(resolved.testRecipient).toBe("resend-test@example.com");
  });

  it("passes validation for complete smtp dry_run config", () => {
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    const errors = validateEmailConfig({
      ...getDefaultEmailConfig(),
      provider: "smtp",
      sendMode: "dry_run",
      smtpHost: "smtp.gmail.com",
      smtpPort: 587,
      smtpSecure: false,
      smtpUser: "",
      smtpPass: "",
      testRecipient: "",
      fromAddress: "sender@company.com",
    });
    expect(errors).toHaveLength(0);
  });
});

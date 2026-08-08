import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  getDefaultEmailConfig,
  resolveEmailConfig,
  validateEmailConfig,
  isOutreachSendingPaused,
  OUTREACH_PAUSED_MESSAGE,
  fromAddressMatchesSmtpUser,
  resolveSmtpCredentials,
  getSmtpStatus,
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

  it("defaults provider to smtp with empty credentials", () => {
    process.env.SMTP_USER = "env@gmail.com";
    process.env.SMTP_PASS = "env-pass";
    process.env.EMAIL_FROM_ADDRESS = "env@gmail.com";
    process.env.EMAIL_FROM_NAME = "Env Name";
    process.env.EMAIL_SEND_MODE = "live";
    process.env.EMAIL_TEST_RECIPIENT = "test@example.com";

    const resolved = resolveEmailConfig({});
    expect(resolved.provider).toBe("smtp");
    expect(resolved.sendMode).toBe("dry_run");
    expect(resolved.smtpUser).toBe("");
    expect(resolved.smtpPass).toBe("");
    expect(resolved.fromAddress).toBe("");
    expect(resolved.fromName).toBe("");
    expect(resolved.testRecipient).toBe("");
  });

  it("does not fall back to env SMTP credentials", () => {
    process.env.SMTP_USER = "env@gmail.com";
    process.env.SMTP_PASS = "env-pass";
    const resolved = resolveEmailConfig({
      smtpUser: "",
      smtpPass: "",
    });
    const creds = resolveSmtpCredentials(resolved);
    expect(creds.user).toBe("");
    expect(creds.pass).toBe("");
    expect(getSmtpStatus(resolved).configured).toBe(false);
  });

  it("uses workspace smtp credentials only", () => {
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
  it("defaults provider to smtp even if EMAIL_PROVIDER env is set", () => {
    process.env.EMAIL_PROVIDER = "resend";
    const resolved = resolveEmailConfig({});
    expect(resolved.provider).toBe("smtp");
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

  it("ignores env test recipient defaults", () => {
    delete process.env.EMAIL_TEST_RECIPIENT;
    process.env.RESEND_TEST_RECIPIENT = "resend-test@example.com";
    const resolved = resolveEmailConfig({});
    expect(resolved.testRecipient).toBe("");
  });

  it("passes validation for complete smtp dry_run config", () => {
    process.env.SMTP_USER = "env@gmail.com";
    process.env.SMTP_PASS = "env-pass";
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

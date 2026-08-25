import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  getDefaultEmailConfig,
  resolveEmailConfig,
  resolveOutreachEmailStyle,
  validateEmailConfig,
  formatFromAddress,
  getDeliverabilityHints,
  isOutreachSendingPaused,
  OUTREACH_PAUSED_MESSAGE,
  fromAddressMatchesSmtpUser,
  resolveSmtpCredentials,
  getSmtpStatus,
  smtpServerFromHost,
  imapHostForSmtp,
  applySmtpServer,
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

  it("defaults new workspaces to a new-inbox daily cap of 30", () => {
    const resolved = resolveEmailConfig({});
    expect(resolved.inboxWarmupStage).toBe("new");
    expect(resolved.dailySendCapPerDomain).toBe(30);
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

  it("maps Zoho India SMTP to imap.zoho.in", () => {
    expect(smtpServerFromHost("smtp.zoho.in")).toBe("zoho_in");
    expect(imapHostForSmtp("smtp.zoho.in")).toEqual({ host: "imap.zoho.in", port: 993 });
    expect(applySmtpServer("zoho_in")).toEqual({
      smtpHost: "smtp.zoho.in",
      smtpPort: 587,
      smtpSecure: false,
    });
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

  it("allows live Resend when a workspace API key is saved", () => {
    const errors = validateEmailConfig({
      ...base,
      provider: "resend",
      sendMode: "live",
      resendApiKey: "re_test_key",
    });
    expect(errors).not.toContain("RESEND_API_KEY must be set before enabling Live send mode");
  });

  it("blocks live Resend when no API key is saved or in env", () => {
    const prev = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;
    const errors = validateEmailConfig({
      ...base,
      provider: "resend",
      sendMode: "live",
    });
    if (prev === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = prev;
    expect(errors).toContain("RESEND_API_KEY must be set before enabling Live send mode");
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

  it("requires from name when sending", () => {
    const errors = validateEmailConfig(
      {
        ...base,
        provider: "resend",
        sendMode: "live",
        resendApiKey: "re_test",
        fromAddress: "hello@example.com",
        fromName: "",
      },
      { forSend: true, resendConfigured: true },
    );
    expect(errors.some((e) => /from name/i.test(e))).toBe(true);
  });
});

describe("outreach email style and from formatting", () => {
  it("forces primary for cold outreach even if marketing is selected", () => {
    expect(resolveOutreachEmailStyle("marketing")).toBe("primary");
    expect(resolveOutreachEmailStyle("primary")).toBe("primary");
    expect(resolveOutreachEmailStyle(undefined)).toBe("primary");
  });

  it("formats From without empty angle-bracket name", () => {
    const withName = formatFromAddress({
      ...getDefaultEmailConfig(),
      fromName: "Arun",
      fromAddress: "hello@srilakshaenterprises.in",
    });
    expect(withName).toBe("Arun <hello@srilakshaenterprises.in>");

    const noName = formatFromAddress({
      ...getDefaultEmailConfig(),
      fromName: "  ",
      fromAddress: "hello@srilakshaenterprises.in",
    });
    expect(noName).toBe("hello@srilakshaenterprises.in");
  });

  it("hints when marketing style or Reply-To is missing on Resend", () => {
    const hints = getDeliverabilityHints({
      ...getDefaultEmailConfig(),
      provider: "resend",
      emailStyle: "marketing",
      fromName: "",
      fromAddress: "hello@srilakshaenterprises.in",
      replyToAddress: "",
    });
    expect(hints.some((h) => /Primary/i.test(h))).toBe(true);
    expect(hints.some((h) => /From name/i.test(h))).toBe(true);
    expect(hints.some((h) => /Reply-To/i.test(h))).toBe(true);
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

  it("defaults send window to weekdays 9–5 Asia/Kolkata", () => {
    const resolved = resolveEmailConfig({});
    expect(resolved.sendDaysOfWeek).toEqual([1, 2, 3, 4, 5]);
    expect(resolved.sendHourStart).toBe(9);
    expect(resolved.sendHourEnd).toBe(17);
    expect(resolved.sendTimezone).toBe("Asia/Kolkata");
  });

  it("normalizes invalid send window overrides", () => {
    const resolved = resolveEmailConfig({
      sendDaysOfWeek: [],
      sendHourStart: 18,
      sendHourEnd: 10,
      sendTimezone: "Nope/Zone",
    });
    expect(resolved.sendDaysOfWeek).toEqual([1, 2, 3, 4, 5]);
    expect(resolved.sendHourStart).toBe(18);
    expect(resolved.sendHourEnd).toBe(19);
    expect(resolved.sendTimezone).toBe("Asia/Kolkata");
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

import { resolveBrandConfig } from "@/lib/email/brand-presets";

export type EmailSendMode = "dry_run" | "test" | "live";
export type EmailStyle = "primary" | "marketing";
export type BrandSlug = "ish" | "prestige" | "custom";
export type CampaignMode = "diwali_gifting" | "mass_ordering" | "festival_bundle" | "custom";

export type BrandConfig = {
  brandSlug: BrandSlug;
  brandName: string;
  vertical: string;
  productSummary: string;
  buyerPersonas: string[];
  toneNotes?: string;
};
export type EmailProvider = "smtp" | "resend";

export type EmailConfig = {
  provider: EmailProvider;
  sendMode: EmailSendMode;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPass: string;
  fromAddress: string;
  fromName: string;
  replyToAddress: string;
  replyToName: string;
  testRecipient: string;
  cadenceDays: [number, number];
  appUrl: string;
  resendApiKey?: string;
  verifiedAt?: string;
  lastReplyPollAt?: string;
  processedReplyMessageIds?: string[];
  emailStyle: EmailStyle;
  brandConfig: BrandConfig;
  campaignMode: CampaignMode;
  campaignNotes?: string;
  dailySendCapPerDomain?: number;
  outreachPaused?: boolean;
  dkimSelector?: string;
  senderHealthCache?: {
    checkedAt: string;
    fromAddress: string;
    result: unknown;
  };
};

export type SmtpCredentials = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
};

export type ProviderStatus = {
  configured: boolean;
  hint: string;
  user?: string;
};

export const EMAIL_PROVIDER_OPTIONS: {
  value: EmailProvider;
  label: string;
  desc: string;
  badge?: string;
}[] = [
  {
    value: "smtp",
    label: "SMTP (Google Workspace)",
    desc: "Send via smtp.gmail.com using an App Password. Recommended for your own domain.",
    badge: "Recommended",
  },
  {
    value: "resend",
    label: "Resend",
    desc: "Send via Resend API. Better for serverless deploys (e.g. Vercel).",
  },
];

export const EMAIL_STYLE_OPTIONS: {
  value: EmailStyle;
  label: string;
  desc: string;
  badge?: string;
}[] = [
  {
    value: "primary",
    label: "Primary inbox (1:1)",
    desc: "Personal sales email — no bulk headers or marketing footer. Best for cold outreach.",
    badge: "Recommended",
  },
  {
    value: "marketing",
    label: "Marketing",
    desc: "Includes unsubscribe footer and tracking pixel. May land in Promotions/Forums.",
  },
];

export const EMAIL_SEND_MODE_OPTIONS: {
  value: EmailSendMode;
  label: string;
  desc: string;
  badge?: string;
}[] = [
  {
    value: "dry_run",
    label: "Dry run",
    desc: "Log emails only — nothing is sent. Safe for development.",
    badge: "Safe",
  },
  {
    value: "test",
    label: "Test",
    desc: "Send to your test inbox only. Real sends go to the test recipient address.",
    badge: "Test",
  },
  {
    value: "live",
    label: "Live",
    desc: "Send to real lead email addresses. Use only when ready for production.",
    badge: "Production",
  },
];

function parseEmailProvider(value: string | undefined): EmailProvider {
  return value === "resend" ? "resend" : "smtp";
}

export function getDefaultEmailConfig(): EmailConfig {
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3002");

  const legacyFrom = process.env.EMAIL_FROM?.trim();
  let fromAddress = process.env.EMAIL_FROM_ADDRESS ?? process.env.SMTP_USER ?? "";
  let fromName = process.env.EMAIL_FROM_NAME ?? "ISH Gifting Team";
  if (legacyFrom?.includes("<")) {
    const match = legacyFrom.match(/^(.+?)\s*<([^>]+)>$/);
    if (match) {
      fromName = match[1].trim();
      fromAddress = match[2].trim();
    }
  } else if (legacyFrom && legacyFrom.includes("@")) {
    fromAddress = legacyFrom;
  }

  const smtpUser = process.env.SMTP_USER?.trim() ?? fromAddress;

  const testRecipient =
    process.env.EMAIL_TEST_RECIPIENT?.trim() ||
    process.env.RESEND_TEST_RECIPIENT?.trim() ||
    "";

  return {
    provider: parseEmailProvider(process.env.EMAIL_PROVIDER),
    sendMode: (process.env.EMAIL_SEND_MODE ?? "dry_run") as EmailSendMode,
    smtpHost: process.env.SMTP_HOST?.trim() || "smtp.gmail.com",
    smtpPort: Number(process.env.SMTP_PORT ?? "587"),
    smtpSecure: process.env.SMTP_SECURE === "true",
    smtpUser,
    smtpPass: process.env.SMTP_PASS?.trim() ?? "",
    fromAddress: fromAddress || smtpUser,
    fromName,
    replyToAddress: process.env.EMAIL_REPLY_TO_ADDRESS ?? fromAddress ?? smtpUser,
    replyToName: process.env.EMAIL_REPLY_TO_NAME ?? fromName,
    testRecipient,
    cadenceDays: [3, 7],
    appUrl,
    emailStyle: (process.env.EMAIL_STYLE === "marketing" ? "marketing" : "primary") as EmailStyle,
    brandConfig: resolveBrandConfig({ brandSlug: "ish" }),
    campaignMode: "diwali_gifting",
    dailySendCapPerDomain: 50,
  };
}

export function resolveEmailConfig(overrides?: Partial<EmailConfig>): EmailConfig {
  const defaults = getDefaultEmailConfig();
  const merged = { ...defaults, ...overrides };

  const cadence = overrides?.cadenceDays ?? merged.cadenceDays;
  const day1 = Math.max(1, Math.min(14, cadence[0] ?? 3));
  const day2 = Math.max(day1 + 1, Math.min(30, cadence[1] ?? 7));

  const brandConfig = resolveBrandConfig(merged.brandConfig);
  const emailStyle = merged.emailStyle ?? "primary";
  const campaignMode = merged.campaignMode ?? "diwali_gifting";

  return {
    ...merged,
    provider: merged.provider ?? "smtp",
    smtpHost: merged.smtpHost?.trim() || "smtp.gmail.com",
    smtpPort: merged.smtpPort || 587,
    smtpSecure: merged.smtpSecure ?? false,
    smtpUser: merged.smtpUser?.trim() ?? "",
    smtpPass: merged.smtpPass ?? "",
    cadenceDays: [day1, day2],
    sendMode: merged.sendMode ?? "dry_run",
    emailStyle,
    brandConfig,
    campaignMode,
    dailySendCapPerDomain: merged.dailySendCapPerDomain ?? 50,
    outreachPaused: merged.outreachPaused ?? false,
  };
}

export function formatFromAddress(config: EmailConfig): string {
  return `${config.fromName} <${config.fromAddress}>`;
}

export function getSmtpEnv(): SmtpCredentials {
  return {
    host: process.env.SMTP_HOST?.trim() ?? "",
    port: Number(process.env.SMTP_PORT ?? "587"),
    secure: process.env.SMTP_SECURE === "true",
    user: process.env.SMTP_USER?.trim() ?? "",
    pass: process.env.SMTP_PASS?.trim() ?? "",
  };
}

export function resolveSmtpCredentials(config: EmailConfig): SmtpCredentials {
  const env = getSmtpEnv();
  return {
    host: config.smtpHost?.trim() || env.host || "smtp.gmail.com",
    port: config.smtpPort || env.port || 587,
    secure: config.smtpSecure ?? env.secure ?? false,
    user: config.smtpUser?.trim() || env.user,
    pass: config.smtpPass?.trim() || env.pass,
  };
}

export function getSmtpStatus(config?: EmailConfig): ProviderStatus {
  const creds = config ? resolveSmtpCredentials(config) : getSmtpEnv();
  if (!creds.host || !creds.user || !creds.pass) {
    return {
      configured: false,
      hint: "Add your Gmail address and App Password in Settings below",
      user: creds.user || undefined,
    };
  }
  return {
    configured: true,
    hint: "SMTP credentials saved",
    user: creds.user,
  };
}

export function getResendStatus(): ProviderStatus {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) {
    return {
      configured: false,
      hint: "Add RESEND_API_KEY to .env.local — get one free at resend.com",
    };
  }
  return { configured: true, hint: "API key configured in environment" };
}

export function fromAddressMatchesSmtpUser(config: EmailConfig): boolean {
  if (config.provider !== "smtp") return true;
  const smtpUser = resolveSmtpCredentials(config).user;
  if (!smtpUser) return true;
  return config.fromAddress.trim().toLowerCase() === smtpUser.toLowerCase();
}

export function validateEmailConfig(
  config: EmailConfig,
  options?: { forSend?: boolean; smtpVerified?: boolean; resendConfigured?: boolean },
): string[] {
  const errors: string[] = [];
  const smtpStatus = getSmtpStatus(config);
  const resendStatus = getResendStatus();
  const providerReady =
    config.provider === "smtp"
      ? (options?.smtpVerified ?? smtpStatus.configured)
      : (options?.resendConfigured ?? resendStatus.configured);

  if (config.provider === "smtp" && smtpStatus.user && !fromAddressMatchesSmtpUser(config)) {
    errors.push(`From email must match your SMTP email (${smtpStatus.user})`);
  }

  if (config.sendMode === "test" && !config.testRecipient.trim()) {
    errors.push("Test recipient is required when send mode is Test");
  }

  if (config.sendMode === "live") {
    if (config.provider === "smtp" && !providerReady) {
      errors.push("SMTP credentials must be verified before enabling Live send mode");
    }
    if (config.provider === "resend" && !resendStatus.configured) {
      errors.push("RESEND_API_KEY must be set before enabling Live send mode");
    }
  }

  if (options?.forSend && config.sendMode === "test" && !config.testRecipient.trim()) {
    errors.push("Test recipient is required to send in test mode");
  }

  if (options?.forSend && config.sendMode !== "dry_run") {
    if (config.provider === "smtp" && !smtpStatus.configured) {
      errors.push("SMTP email and password are not configured");
    }
    if (config.provider === "resend" && !resendStatus.configured) {
      errors.push("RESEND_API_KEY is not configured");
    }
  }

  return errors;
}

export function isOutreachSendingPaused(config: Pick<EmailConfig, "outreachPaused">): boolean {
  return config.outreachPaused === true;
}

export const OUTREACH_PAUSED_MESSAGE =
  "Outreach sending is paused. Resume sending in Settings or the Email queue to send emails.";

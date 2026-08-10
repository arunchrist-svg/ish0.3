import { resolveBrandConfig } from "@/lib/email/brand-presets";
import type { PlatformIntent } from "@/lib/brand/platform-intent";

export type EmailSendMode = "dry_run" | "test" | "live";
export type EmailStyle = "primary" | "marketing";
/** Legacy preset ids kept for migration; new saves use "custom" + verticalPackId. */
export type BrandSlug = "ish" | "prestige" | "custom";
export type CampaignMode = "diwali_gifting" | "mass_ordering" | "festival_bundle" | "custom";
export type VerticalPackId = "general" | "gifting-sweets" | "gifting-appliances";

/** Insights extracted from the seller's website during setup / Settings. */
export type WebsiteBrandInsights = {
  analyzedAt: string;
  brandName?: string;
  vertical: string;
  productSummary: string;
  toneNotes: string;
  buyerPersonas: string[];
  valueProposition?: string;
  differentiators?: string[];
  /** Target industries for Scout (subset of SCOUT_INDUSTRIES). */
  scoutIndustries: string[];
  /** Target departments for Scout people discovery. */
  scoutDepartments: string[];
  /** Target seniority for Scout people discovery. */
  scoutSeniority: string[];
  /** Catalog product category inferred for Brand Intel (e.g. Sweets, Enterprise Software). */
  productCategory?: string;
  /** Inferred Nebula use from the website. */
  platformIntent?: import("@/lib/brand/platform-intent").PlatformIntent;
  /** Short positioning blurb for Writer (2–3 sentences). */
  productWriteup?: string;
  /** Themes Writer should lean on (offers, occasions, proof, logistics). */
  emailKeywords?: string[];
};

export type BrandConfig = {
  brandSlug: BrandSlug;
  brandName: string;
  vertical: string;
  productSummary: string;
  buyerPersonas: string[];
  toneNotes?: string;
  /** Applied vertical pack (knowledge, CTAs, Brand Intel defaults). */
  verticalPackId?: VerticalPackId;
  /**
   * What the client uses Nebula for (SaaS sales, gifting, etc.).
   * Drives campaign-mode dropdowns and Scout fallbacks with verticalPackId.
   */
  platformIntent?: PlatformIntent;
  /** Seller company website collected during onboarding or Settings. */
  websiteUrl?: string;
  /** Auto-filled from website analysis; Writer and Scout consume these. */
  websiteInsights?: WebsiteBrandInsights;
};
export type EmailProvider = "smtp" | "resend";


export type FollowUpPolicy = "auto_send" | "review_all_followups";

export const FOLLOW_UP_POLICY_OPTIONS: { value: FollowUpPolicy; label: string; desc: string }[] = [
  {
    value: "auto_send",
    label: "Auto-send follow-ups",
    desc: "Email 2 and 3 send on schedule if they pass the quality score gate.",
  },
  {
    value: "review_all_followups",
    label: "Review all follow-ups",
    desc: "Route Email 2 and 3 to Needs Review before they send.",
  },
];

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
  followUpPolicy?: "auto_send" | "review_all_followups";
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

export function getDefaultEmailConfig(): EmailConfig {
  // Workspace-owned defaults only. Never seed SMTP/from/test addresses from
  // process.env — those are platform secrets and must not appear on new orgs.
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3002");

  return {
    provider: "smtp",
    sendMode: "dry_run",
    smtpHost: "smtp.gmail.com",
    smtpPort: 587,
    smtpSecure: false,
    smtpUser: "",
    smtpPass: "",
    fromAddress: "",
    fromName: "",
    replyToAddress: "",
    replyToName: "",
    testRecipient: "",
    cadenceDays: [3, 7],
    appUrl,
    emailStyle: "primary",
    brandConfig: resolveBrandConfig({ brandSlug: "custom", verticalPackId: "general" }),
    campaignMode: "custom",
    dailySendCapPerDomain: 50,
    followUpPolicy: "auto_send",
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
  const campaignMode = merged.campaignMode ?? "custom";

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
    followUpPolicy: merged.followUpPolicy ?? "auto_send",
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
  // Use only workspace-stored credentials. Do not fall back to process.env SMTP_* —
  // that would share one mailbox across every tenant.
  return {
    host: config.smtpHost?.trim() || "smtp.gmail.com",
    port: config.smtpPort || 587,
    secure: config.smtpSecure ?? false,
    user: config.smtpUser?.trim() || "",
    pass: config.smtpPass?.trim() || "",
  };
}

export function getSmtpStatus(config?: EmailConfig): ProviderStatus {
  if (!config) {
    return {
      configured: false,
      hint: "Add your Gmail address and App Password in Settings → Email",
    };
  }
  const creds = resolveSmtpCredentials(config);
  if (!creds.host || !creds.user || !creds.pass) {
    return {
      configured: false,
      hint: "Add your Gmail address and App Password in Settings → Email",
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

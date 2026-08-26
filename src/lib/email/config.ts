import { resolveBrandConfig } from "@/lib/email/brand-presets";
import type { PlatformIntent } from "@/lib/brand/platform-intent";
import {
  clampDailySendCap,
  defaultDailyCapForStage,
  recommendedDailyCap,
  warmupCapWarning,
  type InboxWarmupStage,
} from "@/lib/email/sender-warmup";
import {
  DEFAULT_SEND_DAYS,
  DEFAULT_SEND_HOUR_END,
  DEFAULT_SEND_HOUR_START,
  DEFAULT_SEND_TIMEZONE,
  normalizeSendDays,
  normalizeSendHourRanges,
  normalizeSendTimezone,
  type Weekday,
} from "@/lib/email/send-window";

export type EmailSendMode = "dry_run" | "test" | "live";
export type EmailStyle = "primary" | "marketing";
/** Legacy preset ids kept for migration; new saves use "custom" + verticalPackId. */
export type BrandSlug = "ish" | "prestige" | "custom";
export type CampaignMode = "diwali_gifting" | "year_round" | "mass_ordering" | "festival_bundle" | "custom";
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
  /** Who you sell to. Scout and Writer use this so sweets finds employer-buyers, not other sweet shops. */
  icpSummary?: string;
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
  /** Email 1 CTA id (meet_online, gift_sampling, meet_in_person). Set from the preference coach. */
  defaultOutreachCta?: string;
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
  /** Optional phone shown under Warmly sign-off on ISH festive drafts. */
  fromPhone?: string;
  /** Optional branch/location under brand on Warmly (e.g. Kasturinagar). From Email settings. */
  fromLocation?: string;
  /**
   * Free-text signature from Email settings. When set, ISH drafts use it as the
   * identity under Warmly / Thanks & Regards (replacing From name, brand, location).
   * Also appended at send time if the draft body does not already include it.
   */
  signature?: string;
  replyToAddress: string;
  replyToName: string;
  testRecipient: string;
  cadenceDays: [number, number];
  /**
   * Weekdays when follow-ups may send (0 = Sunday … 6 = Saturday).
   * Defaults to Mon–Fri. Snapped when scheduling Email 2/3.
   */
  sendDaysOfWeek?: Weekday[];
  /** Inclusive local hour when the send window opens (6–19.5, half-hour steps). Default 9. */
  sendHourStart?: number;
  /** Exclusive local hour when the send window closes (6.5–20, half-hour steps). Default 17. */
  sendHourEnd?: number;
  /**
   * One or more local hour blocks (e.g. 8–14 and 16–20).
   * When set, this is the source of truth; start/end mirror the outer span.
   */
  sendHourRanges?: { hourStart: number; hourEnd: number }[];
  /** IANA timezone for send-window snapping. Default Asia/Kolkata. */
  sendTimezone?: string;
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
  /** Mailbox age for warmup guidance. Applies to every workspace slug. */
  inboxWarmupStage?: InboxWarmupStage;
  /** ISO timestamp when warmup tracking started (first save or when stage is set to new). */
  inboxWarmupStartedAt?: string;
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
    label: "Inbox (SMTP)",
    desc: "Send via Gmail or Zoho SMTP using the mailbox password or an app-specific password.",
    badge: "Recommended",
  },
  {
    value: "resend",
    label: "Resend",
    desc: "Send via Resend API. Needs a domain you can verify in DNS.",
  },
];

export type SmtpServerId = "gmail" | "zoho_in" | "zoho_com";

export const SMTP_SERVER_OPTIONS: {
  value: SmtpServerId;
  label: string;
  host: string;
  port: number;
  secure: boolean;
  imapHost: string;
}[] = [
  {
    value: "gmail",
    label: "Gmail",
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    imapHost: "imap.gmail.com",
  },
  {
    value: "zoho_in",
    label: "Zoho India",
    host: "smtp.zoho.in",
    port: 587,
    secure: false,
    imapHost: "imap.zoho.in",
  },
  {
    value: "zoho_com",
    label: "Zoho",
    host: "smtp.zoho.com",
    port: 587,
    secure: false,
    imapHost: "imap.zoho.com",
  },
];

export function smtpServerFromHost(host?: string | null): SmtpServerId {
  const h = (host ?? "").trim().toLowerCase();
  if (h.includes("zoho.in")) return "zoho_in";
  if (h.includes("zoho")) return "zoho_com";
  return "gmail";
}

export function applySmtpServer(id: SmtpServerId): Pick<EmailConfig, "smtpHost" | "smtpPort" | "smtpSecure"> {
  const option = SMTP_SERVER_OPTIONS.find((o) => o.value === id) ?? SMTP_SERVER_OPTIONS[0];
  return { smtpHost: option.host, smtpPort: option.port, smtpSecure: option.secure };
}

export function imapHostForSmtp(host?: string | null): { host: string; port: number } {
  const id = smtpServerFromHost(host);
  const option = SMTP_SERVER_OPTIONS.find((o) => o.value === id) ?? SMTP_SERVER_OPTIONS[0];
  return { host: option.imapHost, port: 993 };
}

export const EMAIL_STYLE_OPTIONS: {
  value: EmailStyle;
  label: string;
  desc: string;
  badge?: string;
}[] = [
  {
    value: "primary",
    label: "Primary inbox (1:1)",
    desc: "Recommended for company cold outreach. No List-Unsubscribe, no marketing footer. Quiet open pixel only when App URL is public. Pixel hits can fire from scanners without a human open.",
    badge: "Recommended",
  },
  {
    value: "marketing",
    label: "Marketing",
    desc: "Adds unsubscribe footer and List-Unsubscribe headers. Often lands in Promotions. Nebula outreach still sends as Primary.",
  },
];

/**
 * Cold outreach HTML/headers always use primary (1:1).
 * Marketing style adds List-Unsubscribe and footers that push Gmail Promotions/spam for company inboxes.
 */
export function resolveOutreachEmailStyle(
  _style?: EmailStyle | null,
): EmailStyle {
  return "primary";
}

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
    fromPhone: "",
    fromLocation: "",
    signature: "",
    replyToAddress: "",
    replyToName: "",
    testRecipient: "",
    cadenceDays: [3, 7],
    sendDaysOfWeek: [...DEFAULT_SEND_DAYS],
    sendHourStart: DEFAULT_SEND_HOUR_START,
    sendHourEnd: DEFAULT_SEND_HOUR_END,
    sendHourRanges: [{ hourStart: DEFAULT_SEND_HOUR_START, hourEnd: DEFAULT_SEND_HOUR_END }],
    sendTimezone: DEFAULT_SEND_TIMEZONE,
    appUrl,
    emailStyle: "primary",
    brandConfig: resolveBrandConfig({ brandSlug: "custom", verticalPackId: "general" }),
    campaignMode: "custom",
    dailySendCapPerDomain: defaultDailyCapForStage("new"),
    inboxWarmupStage: "new",
    followUpPolicy: "auto_send",
  };
}

export function resolveEmailConfig(overrides?: Partial<EmailConfig>): EmailConfig {
  const defaults = getDefaultEmailConfig();
  const merged = { ...defaults, ...overrides };

  const cadence = overrides?.cadenceDays ?? merged.cadenceDays;
  const day1 = Math.max(1, Math.min(14, cadence[0] ?? 3));
  const day2 = Math.max(day1 + 1, Math.min(30, cadence[1] ?? 7));
  const sendHourRanges = normalizeSendHourRanges(
    overrides && Object.prototype.hasOwnProperty.call(overrides, "sendHourRanges")
      ? overrides.sendHourRanges
      : overrides &&
          (Object.prototype.hasOwnProperty.call(overrides, "sendHourStart") ||
            Object.prototype.hasOwnProperty.call(overrides, "sendHourEnd"))
        ? null
        : merged.sendHourRanges,
    merged.sendHourStart,
    merged.sendHourEnd,
  );

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
    fromName: merged.fromName?.trim() ?? "",
    fromPhone: merged.fromPhone?.trim() ?? "",
    fromLocation: merged.fromLocation?.trim() ?? "",
    signature: merged.signature?.trim() ?? "",
    cadenceDays: [day1, day2],
    sendDaysOfWeek: normalizeSendDays(merged.sendDaysOfWeek),
    sendHourStart: sendHourRanges[0]!.hourStart,
    sendHourEnd: sendHourRanges[sendHourRanges.length - 1]!.hourEnd,
    sendHourRanges,
    sendTimezone: normalizeSendTimezone(merged.sendTimezone),
    sendMode: merged.sendMode ?? "dry_run",
    emailStyle,
    brandConfig,
    campaignMode,
    dailySendCapPerDomain: clampDailySendCap(
      merged.dailySendCapPerDomain,
      defaultDailyCapForStage(merged.inboxWarmupStage ?? "new"),
    ),
    inboxWarmupStage: merged.inboxWarmupStage ?? "new",
    inboxWarmupStartedAt: merged.inboxWarmupStartedAt,
    outreachPaused: merged.outreachPaused ?? false,
    followUpPolicy: merged.followUpPolicy ?? "auto_send",
  };
}

export function formatFromAddress(config: EmailConfig): string {
  const address = config.fromAddress?.trim() ?? "";
  const name = config.fromName?.trim() ?? "";
  if (!name) return address;
  return `${name} <${address}>`;
}

/** Prefer explicit send reply-to, then workspace Reply-To, then From. */
export function resolveReplyToAddress(
  params: { replyTo?: string },
  config: EmailConfig,
): string | undefined {
  const fromParams = params.replyTo?.trim();
  if (fromParams) return fromParams;
  const configured = config.replyToAddress?.trim();
  if (configured) return configured;
  const from = config.fromAddress?.trim();
  if (from) return from;
  return undefined;
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
      hint: "Add your inbox email and App Password in Settings → Email",
    };
  }
  const creds = resolveSmtpCredentials(config);
  if (!creds.host || !creds.user || !creds.pass) {
    return {
      configured: false,
      hint: "Add your inbox email and App Password in Settings → Email",
      user: creds.user || undefined,
    };
  }
  return {
    configured: true,
    hint: "SMTP credentials saved",
    user: creds.user,
  };
}

export function getResendStatus(config?: Pick<EmailConfig, "resendApiKey">): ProviderStatus {
  const key = config?.resendApiKey?.trim() || process.env.RESEND_API_KEY?.trim();
  if (!key) {
    return {
      configured: false,
      hint: "Paste a Resend API key in Settings → Email, or add RESEND_API_KEY to .env.local (resend.com/api-keys)",
    };
  }
  return {
    configured: true,
    hint: config?.resendApiKey?.trim()
      ? "Resend API key saved in Settings"
      : "API key configured in environment",
  };
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
  const resendStatus = getResendStatus(config);
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
    if (!config.fromAddress?.trim()) {
      errors.push("From email is required to send");
    }
    if (!config.fromName?.trim()) {
      errors.push("From name should be a real person (e.g. Arun), not a company or noreply label");
    }
  }

  return errors;
}

/** Soft deliverability hints for Settings (not hard send blockers). */
export function getDeliverabilityHints(config: EmailConfig): string[] {
  const hints: string[] = [];
  if (config.emailStyle === "marketing") {
    hints.push(
      "Inbox is set to Marketing. Nebula cold outreach still sends as Primary (no unsubscribe headers). Switch Inbox to Primary to match Writer guidance.",
    );
  }
  if (!config.fromName?.trim()) {
    hints.push(
      "Set From name to a real person (first name or first + last). Empty or noreply-style names hurt trust at company inboxes.",
    );
  }
  if (config.provider === "resend" && !config.replyToAddress?.trim()) {
    hints.push(
      "Set Reply-To to a monitored inbox (often the same as From). Replies and trust signals matter for company deliverability.",
    );
  }
  if (config.provider === "resend" && !config.fromAddress?.trim()) {
    hints.push(
      "From email must be on a domain verified in Resend (SPF/DKIM). Shared or unverified domains land in spam more often.",
    );
  }
  const rec = recommendedDailyCap({
    stage: config.inboxWarmupStage,
    warmupStartedAt: config.inboxWarmupStartedAt,
  });
  const capWarning = warmupCapWarning(config.dailySendCapPerDomain ?? rec.recommended, rec);
  if (capWarning) hints.push(capWarning);
  return hints;
}

export function isOutreachSendingPaused(config: Pick<EmailConfig, "outreachPaused">): boolean {
  return config.outreachPaused === true;
}

export const OUTREACH_PAUSED_MESSAGE =
  "Outreach sending is paused. Resume sending in Settings or the Email queue to send emails.";

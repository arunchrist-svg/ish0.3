import { db, workspaceSettings } from "@/db";
import type { EmailConfig } from "@/lib/email/config";
import {
  getResendStatus,
  resolveEmailConfig,
  validateEmailConfig,
} from "@/lib/email/config";
import { invalidateEmailConfigCache } from "@/lib/email/email-sender";
import { isPublicAppUrl } from "@/lib/email/plain-text";
import { smtpTransport } from "@/lib/email/smtp-transport";
import { resendTransport } from "@/lib/email/resend-transport";
import { requireTenantContext } from "@/lib/tenant";
import { eq } from "drizzle-orm";

export type EmailConfigResponse = Omit<EmailConfig, "smtpPass" | "resendApiKey"> & {
  smtpPassSet: boolean;
  resendApiKeySet: boolean;
  smtpConfigured: boolean;
  smtpHint: string;
  resendConfigured: boolean;
  resendHint: string;
  validationWarnings: string[];
};

export class EmailSettingsValidationError extends Error {
  errors: string[];

  constructor(errors: string[]) {
    super(errors.join("; "));
    this.name = "EmailSettingsValidationError";
    this.errors = errors;
  }
}

export async function loadWorkspaceEmailOverrides(workspaceId?: string): Promise<Partial<EmailConfig>> {
  try {
    const resolvedWorkspaceId = workspaceId ?? (await requireTenantContext()).workspaceId;
    const [row] = await db
      .select()
      .from(workspaceSettings)
      .where(eq(workspaceSettings.workspaceId, resolvedWorkspaceId))
      .limit(1);

    return (row?.emailConfig as Partial<EmailConfig> | undefined) ?? {};
  } catch (e) {
    console.error("[email-settings] load failed:", e);
    return {};
  }
}

function toPublicResponse(
  config: EmailConfig,
  extras: {
    smtpConfigured: boolean;
    smtpHint: string;
    resendConfigured: boolean;
    resendHint: string;
    validationWarnings: string[];
  },
): EmailConfigResponse {
  const { smtpPass, resendApiKey, ...publicConfig } = config;
  return {
    ...publicConfig,
    smtpPassSet: Boolean(smtpPass?.trim()),
    resendApiKeySet: Boolean(resendApiKey?.trim()),
    ...extras,
  };
}

async function persistEmailConfig(config: EmailConfig, workspaceId?: string): Promise<void> {
  const resolvedWorkspaceId = workspaceId ?? (await requireTenantContext()).workspaceId;
  await db
    .insert(workspaceSettings)
    .values({
      workspaceId: resolvedWorkspaceId,
      emailConfig: config,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: workspaceSettings.workspaceId,
      set: {
        emailConfig: config,
        updatedAt: new Date(),
      },
    });
  invalidateEmailConfigCache();
}

async function buildEmailConfigResponse(config: EmailConfig): Promise<EmailConfigResponse> {
  const resendStatus = resendTransport.getStatus(config);

  let smtpConfigured = false;
  let smtpHint = smtpTransport.getStatus(config).hint;

  if (config.provider === "smtp") {
    const verified = await smtpTransport.verify(config);
    smtpConfigured = verified.configured;
    smtpHint = verified.hint;
  }

  const validationWarnings = validateEmailConfig(config, {
    smtpVerified: smtpConfigured,
    resendConfigured: resendStatus.configured,
  });
  if (!isPublicAppUrl(config.appUrl)) {
    validationWarnings.push(
      "App URL is localhost — open tracking is disabled. Set NEXT_PUBLIC_APP_URL to your deployed HTTPS URL for better deliverability.",
    );
  }

  return toPublicResponse(config, {
    smtpConfigured,
    smtpHint,
    resendConfigured: resendStatus.configured,
    resendHint: resendStatus.hint,
    validationWarnings,
  });
}

export async function saveWorkspaceEmailOverrides(
  partial: Partial<EmailConfig>,
  workspaceId?: string,
): Promise<EmailConfigResponse> {
  const existing = await loadWorkspaceEmailOverrides(workspaceId);

  const mergedPartial = { ...partial };
  if (!mergedPartial.smtpPass?.trim() && existing.smtpPass) {
    mergedPartial.smtpPass = existing.smtpPass;
  }

  const merged = resolveEmailConfig({ ...existing, ...mergedPartial });

  const smtpVerified =
    merged.provider === "smtp" ? (await smtpTransport.verify(merged)).configured : false;
  const resendConfigured = resendTransport.getStatus(merged).configured;

  const errors = validateEmailConfig(merged, { smtpVerified, resendConfigured });
  if (errors.length > 0) {
    throw new EmailSettingsValidationError(errors);
  }

  await persistEmailConfig(merged, workspaceId);
  return buildEmailConfigResponse(merged);
}

export async function getResolvedEmailConfig(workspaceId?: string): Promise<EmailConfig> {
  const stored = await loadWorkspaceEmailOverrides(workspaceId);
  return resolveEmailConfig(stored);
}

export async function verifyEmailConnection(
  partial?: Partial<EmailConfig>,
): Promise<EmailConfigResponse> {
  const existing = await loadWorkspaceEmailOverrides();
  const mergedPartial = { ...partial };
  if (!mergedPartial.smtpPass?.trim() && existing.smtpPass) {
    mergedPartial.smtpPass = existing.smtpPass;
  }
  const merged = resolveEmailConfig({ ...existing, ...mergedPartial });
  const verified = await smtpTransport.verify(merged);

  if (verified.configured) {
    await persistEmailConfig(merged);
  }

  const resendStatus = getResendStatus();
  const validationWarnings = validateEmailConfig(merged, {
    smtpVerified: verified.configured,
    resendConfigured: resendStatus.configured,
  });

  return toPublicResponse(merged, {
    smtpConfigured: verified.configured,
    smtpHint: verified.hint,
    resendConfigured: resendStatus.configured,
    resendHint: resendStatus.hint,
    validationWarnings,
  });
}


export async function setOutreachPaused(paused: boolean, workspaceId?: string): Promise<EmailConfigResponse> {
  const overrides = await loadWorkspaceEmailOverrides(workspaceId);
  const merged = resolveEmailConfig({ ...overrides, outreachPaused: paused });
  await persistEmailConfig(merged, workspaceId);
  invalidateEmailConfigCache();
  return getEmailConfigForApi();
}

export async function getEmailConfigForApi(): Promise<EmailConfigResponse> {
  const config = await getResolvedEmailConfig();
  return buildEmailConfigResponse(config);
}

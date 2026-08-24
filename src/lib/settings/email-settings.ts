import { db, tenants, workspaceSettings } from "@/db";
import type { EmailConfig } from "@/lib/email/config";
import {
  getDeliverabilityHints,
  getResendStatus,
  resolveEmailConfig,
  validateEmailConfig,
} from "@/lib/email/config";
import type { BrandConfig } from "@/lib/email/config";
import { invalidateEmailConfigCache } from "@/lib/email/email-sender";
import { isPublicAppUrl } from "@/lib/email/plain-text";
import { smtpTransport } from "@/lib/email/smtp-transport";
import { resendTransport } from "@/lib/email/resend-transport";
import { verifyImapAccess } from "@/lib/email/imap-inbox";
import { repliesCapability } from "@/lib/email/replies-capability";
import {
  sealEmailSecrets,
  secretsNeedSealing,
  unsealEmailSecrets,
} from "@/lib/email/secret-crypto";
import { clearTenantContextCache, requireTenantContext } from "@/lib/tenant";
import { eq } from "drizzle-orm";

export type EmailConfigResponse = Omit<EmailConfig, "smtpPass" | "resendApiKey"> & {
  smtpPassSet: boolean;
  resendApiKeySet: boolean;
  smtpConfigured: boolean;
  smtpHint: string;
  imapConfigured: boolean;
  imapHint: string;
  resendConfigured: boolean;
  resendHint: string;
  repliesSupported: boolean;
  repliesHint: string;
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

    const stored = (row?.emailConfig as Partial<EmailConfig> | undefined) ?? {};
    const unsealed = unsealEmailSecrets(stored);
    if (row && secretsNeedSealing(stored)) {
      await db
        .update(workspaceSettings)
        .set({
          emailConfig: sealEmailSecrets(unsealed) as EmailConfig,
          updatedAt: new Date(),
        })
        .where(eq(workspaceSettings.workspaceId, resolvedWorkspaceId));
    }
    return unsealed;
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
    imapConfigured: boolean;
    imapHint: string;
    resendConfigured: boolean;
    resendHint: string;
    validationWarnings: string[];
  },
): EmailConfigResponse {
  const { smtpPass, resendApiKey, ...publicConfig } = config;
  const replies = repliesCapability(config);
  return {
    ...publicConfig,
    smtpPassSet: Boolean(smtpPass?.trim()),
    resendApiKeySet: Boolean(resendApiKey?.trim()),
    repliesSupported: replies.supported,
    repliesHint: replies.hint,
    ...extras,
  };
}

const EMAIL_CONFIG_TTL_MS = 30_000;
const emailConfigCache = new Map<string, { config: EmailConfig; expiresAt: number }>();

export function clearResolvedEmailConfigCache() {
  emailConfigCache.clear();
}

export async function persistEmailConfig(config: EmailConfig, workspaceId?: string): Promise<void> {
  const resolvedWorkspaceId = workspaceId ?? (await requireTenantContext()).workspaceId;
  const toStore: EmailConfig = {
    ...config,
    inboxWarmupStartedAt: config.inboxWarmupStartedAt ?? new Date().toISOString(),
  };
  const sealed = sealEmailSecrets(toStore);
  await db
    .insert(workspaceSettings)
    .values({
      workspaceId: resolvedWorkspaceId,
      emailConfig: sealed,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: workspaceSettings.workspaceId,
      set: {
        emailConfig: sealed,
        updatedAt: new Date(),
      },
    });
  invalidateEmailConfigCache();
  clearResolvedEmailConfigCache();
}

async function clearDemoModeForCurrentTenant() {
  try {
    const ctx = await requireTenantContext();
    await db.update(tenants).set({ demoMode: false }).where(eq(tenants.id, ctx.tenantId));
    clearTenantContextCache();
  } catch {
    // Cron/job persist paths have no session; skip.
  }
}

async function buildEmailConfigResponse(config: EmailConfig): Promise<EmailConfigResponse> {
  const resendStatus = resendTransport.getStatus(config);

  let smtpConfigured = false;
  let smtpHint = smtpTransport.getStatus(config).hint;
  let imapConfigured = false;
  let imapHint = "Reply sync checks IMAP with the same App Password";

  if (config.provider === "smtp") {
    const [verified, imapStatus] = await Promise.all([
      smtpTransport.verify(config),
      verifyImapAccess(config),
    ]);
    smtpConfigured = verified.configured;
    smtpHint = verified.hint;
    imapConfigured = imapStatus.configured;
    imapHint = imapStatus.hint;
  }

  const validationWarnings = validateEmailConfig(config, {
    smtpVerified: smtpConfigured,
    resendConfigured: resendStatus.configured,
  });
  validationWarnings.push(...getDeliverabilityHints(config));
  if (config.provider === "smtp" && smtpConfigured && !imapConfigured) {
    validationWarnings.push(
      "Sending works, but Sync replies needs IMAP enabled in Zoho Mail (Settings → Mail Accounts → IMAP Access) with the same App Password.",
    );
  }
  if (!isPublicAppUrl(config.appUrl)) {
    validationWarnings.push(
      "App URL is localhost. Open tracking stays off until you set a public HTTPS App URL (tracking is optional; Primary outreach does not need it).",
    );
  }

  return toPublicResponse(config, {
    smtpConfigured,
    smtpHint,
    imapConfigured,
    imapHint,
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
  if (!mergedPartial.resendApiKey?.trim() && existing.resendApiKey) {
    mergedPartial.resendApiKey = existing.resendApiKey;
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
  const smtpReady = merged.provider === "smtp" ? smtpVerified : resendConfigured;
  if (merged.sendMode === "live" && smtpReady) {
    await clearDemoModeForCurrentTenant();
  }
  return buildEmailConfigResponse(merged);
}

export async function getResolvedEmailConfig(workspaceId?: string): Promise<EmailConfig> {
  const cacheKey = workspaceId ?? "_default";
  const cached = emailConfigCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.config;

  const stored = await loadWorkspaceEmailOverrides(workspaceId);
  const config = resolveEmailConfig(stored);
  emailConfigCache.set(cacheKey, { config, expiresAt: Date.now() + EMAIL_CONFIG_TTL_MS });
  return config;
}

/** Merge brand fields without re-running SMTP/send-mode validation (onboarding / website analyse). */
export async function patchWorkspaceBrandConfig(
  brandConfig: BrandConfig,
  workspaceId?: string,
  extras?: { campaignMode?: EmailConfig["campaignMode"]; campaignNotes?: string },
): Promise<EmailConfig> {
  const existing = await loadWorkspaceEmailOverrides(workspaceId);
  const merged = resolveEmailConfig({
    ...existing,
    brandConfig,
    ...(extras?.campaignMode ? { campaignMode: extras.campaignMode } : {}),
    ...(extras?.campaignNotes !== undefined ? { campaignNotes: extras.campaignNotes } : {}),
  });
  await persistEmailConfig(merged, workspaceId);
  return merged;
}

export async function verifyEmailConnection(
  partial?: Partial<EmailConfig>,
): Promise<EmailConfigResponse> {
  const existing = await loadWorkspaceEmailOverrides();
  const mergedPartial = { ...partial };
  if (!mergedPartial.smtpPass?.trim() && existing.smtpPass) {
    mergedPartial.smtpPass = existing.smtpPass;
  }
  if (!mergedPartial.resendApiKey?.trim() && existing.resendApiKey) {
    mergedPartial.resendApiKey = existing.resendApiKey;
  }
  const merged = resolveEmailConfig({ ...existing, ...mergedPartial });
  const [verified, imapStatus] = await Promise.all([
    smtpTransport.verify(merged),
    merged.provider === "smtp" ? verifyImapAccess(merged) : Promise.resolve({ configured: false, hint: "" }),
  ]);

  if (verified.configured) {
    await persistEmailConfig(merged);
    if (merged.sendMode === "live") await clearDemoModeForCurrentTenant();
  }

  const resendStatus = getResendStatus(merged);
  const validationWarnings = validateEmailConfig(merged, {
    smtpVerified: verified.configured,
    resendConfigured: resendStatus.configured,
  });
  validationWarnings.push(...getDeliverabilityHints(merged));
  if (merged.provider === "smtp" && verified.configured && !imapStatus.configured) {
    validationWarnings.push(
      "Sending works, but Sync replies needs IMAP enabled in Zoho Mail (Settings → Mail Accounts → IMAP Access) with the same App Password.",
    );
  }

  return toPublicResponse(merged, {
    smtpConfigured: verified.configured,
    smtpHint: verified.hint,
    imapConfigured: imapStatus.configured,
    imapHint: imapStatus.hint || "Reply sync checks IMAP with the same App Password",
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
  if (workspaceId) {
    const config = await getResolvedEmailConfig(workspaceId);
    return buildEmailConfigResponse(config);
  }
  return getEmailConfigForApi();
}

export async function getEmailConfigForApi(): Promise<EmailConfigResponse> {
  const config = await getResolvedEmailConfig();
  return buildEmailConfigResponse(config);
}

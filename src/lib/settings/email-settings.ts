import { db, tenants, userEmailSettings, workspaceSettings } from "@/db";
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
import { and, eq } from "drizzle-orm";

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

/** Sender identity + mailbox credentials. Each login keeps their own copy. */
const USER_EMAIL_KEYS = [
  "provider",
  "smtpHost",
  "smtpPort",
  "smtpSecure",
  "smtpUser",
  "smtpPass",
  "fromAddress",
  "fromName",
  "fromPhone",
  "fromLocation",
  "signature",
  "replyToAddress",
  "replyToName",
  "testRecipient",
  "verifiedAt",
  "lastReplyPollAt",
  "processedReplyMessageIds",
  "inboxWarmupStage",
  "inboxWarmupStartedAt",
  "senderHealthCache",
  "dkimSelector",
] as const satisfies ReadonlyArray<keyof EmailConfig>;

type UserEmailKey = (typeof USER_EMAIL_KEYS)[number];

function pickUserEmailFields(source: Partial<EmailConfig>): Partial<EmailConfig> {
  const out: Partial<EmailConfig> = {};
  for (const key of USER_EMAIL_KEYS) {
    if (Object.prototype.hasOwnProperty.call(source, key) && source[key] !== undefined) {
      (out as Record<string, unknown>)[key] = source[key];
    }
  }
  return out;
}

function omitUserEmailFields(source: Partial<EmailConfig>): Partial<EmailConfig> {
  const out: Partial<EmailConfig> = { ...source };
  for (const key of USER_EMAIL_KEYS) {
    delete out[key];
  }
  return out;
}

function cacheKey(workspaceId: string | undefined, userId?: string | null): string {
  return `${workspaceId ?? "_default"}::${userId ?? "_workspace"}`;
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

export async function loadUserEmailOverrides(
  workspaceId: string,
  userId: string,
): Promise<Partial<EmailConfig>> {
  try {
    const [row] = await db
      .select()
      .from(userEmailSettings)
      .where(
        and(eq(userEmailSettings.workspaceId, workspaceId), eq(userEmailSettings.userId, userId)),
      )
      .limit(1);

    const stored = (row?.emailConfig as Partial<EmailConfig> | undefined) ?? {};
    const unsealed = unsealEmailSecrets(stored);
    if (row && secretsNeedSealing(stored)) {
      await db
        .update(userEmailSettings)
        .set({
          emailConfig: sealEmailSecrets(unsealed) as EmailConfig,
          updatedAt: new Date(),
        })
        .where(
          and(eq(userEmailSettings.workspaceId, workspaceId), eq(userEmailSettings.userId, userId)),
        );
    }
    return unsealed;
  } catch (e) {
    console.error("[email-settings] load user failed:", e);
    return {};
  }
}

export async function listWorkspaceUserEmailSettings(
  workspaceId: string,
): Promise<Array<{ userId: string; overrides: Partial<EmailConfig> }>> {
  const rows = await db
    .select()
    .from(userEmailSettings)
    .where(eq(userEmailSettings.workspaceId, workspaceId));

  return rows.map((row) => ({
    userId: row.userId,
    overrides: unsealEmailSecrets((row.emailConfig as Partial<EmailConfig> | undefined) ?? {}),
  }));
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

export async function persistWorkspaceEmailConfig(
  config: EmailConfig,
  workspaceId?: string,
): Promise<void> {
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

/** @deprecated Prefer persistWorkspaceEmailConfig or persistUserEmailConfig. */
export async function persistEmailConfig(config: EmailConfig, workspaceId?: string): Promise<void> {
  await persistWorkspaceEmailConfig(config, workspaceId);
}

export async function persistUserEmailConfig(
  partial: Partial<EmailConfig>,
  workspaceId: string,
  userId: string,
): Promise<void> {
  const existing = await loadUserEmailOverrides(workspaceId, userId);
  const mergedUser = pickUserEmailFields({ ...existing, ...partial });
  if (!mergedUser.inboxWarmupStartedAt && (mergedUser.smtpUser || mergedUser.fromAddress)) {
    mergedUser.inboxWarmupStartedAt = new Date().toISOString();
  }
  const sealed = sealEmailSecrets(mergedUser);
  await db
    .insert(userEmailSettings)
    .values({
      workspaceId,
      userId,
      emailConfig: sealed,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [userEmailSettings.workspaceId, userEmailSettings.userId],
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

function preserveSecrets(
  partial: Partial<EmailConfig>,
  existing: Partial<EmailConfig>,
): Partial<EmailConfig> {
  const mergedPartial = { ...partial };
  if (!mergedPartial.smtpPass?.trim() && existing.smtpPass) {
    mergedPartial.smtpPass = existing.smtpPass;
  }
  if (!mergedPartial.resendApiKey?.trim() && existing.resendApiKey) {
    mergedPartial.resendApiKey = existing.resendApiKey;
  }
  return mergedPartial;
}

export async function saveWorkspaceEmailOverrides(
  partial: Partial<EmailConfig>,
  workspaceId?: string,
  userId?: string,
): Promise<EmailConfigResponse> {
  const ctx = workspaceId && userId ? null : await requireTenantContext().catch(() => null);
  const resolvedWorkspaceId = workspaceId ?? ctx?.workspaceId;
  const resolvedUserId = userId ?? ctx?.userId;
  if (!resolvedWorkspaceId) throw new Error("workspaceId required");

  const workspaceExisting = await loadWorkspaceEmailOverrides(resolvedWorkspaceId);
  const userExisting = resolvedUserId
    ? await loadUserEmailOverrides(resolvedWorkspaceId, resolvedUserId)
    : {};

  const withSecrets = preserveSecrets(partial, { ...workspaceExisting, ...userExisting });
  const userPatch = pickUserEmailFields(withSecrets);
  const workspacePatch = omitUserEmailFields(withSecrets);

  const nextWorkspace = { ...workspaceExisting, ...workspacePatch };
  const nextUser = { ...userExisting, ...userPatch };
  const merged = resolveEmailConfig({ ...nextWorkspace, ...nextUser });

  const smtpVerified =
    merged.provider === "smtp" ? (await smtpTransport.verify(merged)).configured : false;
  const resendConfigured = resendTransport.getStatus(merged).configured;

  const errors = validateEmailConfig(merged, { smtpVerified, resendConfigured });
  if (errors.length > 0) {
    throw new EmailSettingsValidationError(errors);
  }

  if (Object.keys(workspacePatch).length > 0 || Object.keys(userPatch).length === 0) {
    await persistWorkspaceEmailConfig(resolveEmailConfig(nextWorkspace), resolvedWorkspaceId);
  }
  if (resolvedUserId && Object.keys(userPatch).length > 0) {
    await persistUserEmailConfig(nextUser, resolvedWorkspaceId, resolvedUserId);
  }

  const smtpReady = merged.provider === "smtp" ? smtpVerified : resendConfigured;
  if (merged.sendMode === "live" && smtpReady) {
    await clearDemoModeForCurrentTenant();
  }
  return buildEmailConfigResponse(merged);
}

/**
 * Resolve email config: workspace brand/cadence + optional per-user sender identity.
 * - `userId` string: merge that user's mailbox/signature
 * - `userId` null: workspace only (no session overlay)
 * - `userId` omitted: use session user when available (Settings / interactive sends)
 */
export async function getResolvedEmailConfig(
  workspaceId?: string,
  userId?: string | null,
): Promise<EmailConfig> {
  let resolvedWorkspaceId = workspaceId;
  let resolvedUserId: string | null | undefined = userId;

  if (resolvedWorkspaceId === undefined || userId === undefined) {
    try {
      const ctx = await requireTenantContext();
      resolvedWorkspaceId = resolvedWorkspaceId ?? ctx.workspaceId;
      if (userId === undefined) resolvedUserId = ctx.userId;
    } catch {
      // Cron / no session
    }
  }

  const key = cacheKey(resolvedWorkspaceId, resolvedUserId);
  const cached = emailConfigCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.config;

  const storedWorkspace = await loadWorkspaceEmailOverrides(resolvedWorkspaceId);
  const storedUser =
    resolvedUserId && resolvedWorkspaceId
      ? await loadUserEmailOverrides(resolvedWorkspaceId, resolvedUserId)
      : {};

  const config = resolveEmailConfig({ ...storedWorkspace, ...storedUser });
  emailConfigCache.set(key, { config, expiresAt: Date.now() + EMAIL_CONFIG_TTL_MS });
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
  await persistWorkspaceEmailConfig(merged, workspaceId);
  return merged;
}

export async function verifyEmailConnection(
  partial?: Partial<EmailConfig>,
  userId?: string,
): Promise<EmailConfigResponse> {
  const ctx = await requireTenantContext();
  const resolvedUserId = userId ?? ctx.userId;
  const workspaceExisting = await loadWorkspaceEmailOverrides(ctx.workspaceId);
  const userExisting = await loadUserEmailOverrides(ctx.workspaceId, resolvedUserId);
  const withSecrets = preserveSecrets(partial ?? {}, { ...workspaceExisting, ...userExisting });
  const userPatch = pickUserEmailFields(withSecrets);
  const workspacePatch = omitUserEmailFields(withSecrets);
  const merged = resolveEmailConfig({
    ...workspaceExisting,
    ...workspacePatch,
    ...userExisting,
    ...userPatch,
  });
  const [verified, imapStatus] = await Promise.all([
    smtpTransport.verify(merged),
    merged.provider === "smtp" ? verifyImapAccess(merged) : Promise.resolve({ configured: false, hint: "" }),
  ]);

  if (verified.configured) {
    if (Object.keys(workspacePatch).length > 0) {
      await persistWorkspaceEmailConfig(
        resolveEmailConfig({ ...workspaceExisting, ...workspacePatch }),
        ctx.workspaceId,
      );
    }
    await persistUserEmailConfig(
      { ...userExisting, ...userPatch, verifiedAt: new Date().toISOString() },
      ctx.workspaceId,
      resolvedUserId,
    );
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
  await persistWorkspaceEmailConfig(merged, workspaceId);
  invalidateEmailConfigCache();
  if (workspaceId) {
    const config = await getResolvedEmailConfig(workspaceId);
    return buildEmailConfigResponse(config);
  }
  return getEmailConfigForApi();
}

export async function getEmailConfigForApi(userId?: string): Promise<EmailConfigResponse> {
  const ctx = await requireTenantContext();
  const config = await getResolvedEmailConfig(ctx.workspaceId, userId ?? ctx.userId);
  return buildEmailConfigResponse(config);
}

export type { UserEmailKey };

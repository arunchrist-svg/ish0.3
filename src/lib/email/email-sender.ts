import type { EmailConfig, EmailProvider } from "@/lib/email/config";
import { formatFromAddress, validateEmailConfig } from "@/lib/email/config";
import { resendTransport } from "@/lib/email/resend-transport";
import { smtpTransport } from "@/lib/email/smtp-transport";
import type { MailTransport, SendParams, SendResult } from "@/lib/email/types";
import { requireTenantContext } from "@/lib/tenant";
import { getResolvedEmailConfig } from "@/lib/settings/email-settings";

export type { SendParams, SendResult } from "@/lib/email/types";

const transports: Record<EmailProvider, MailTransport> = {
  smtp: smtpTransport,
  resend: resendTransport,
};

type ConfigCacheEntry = { config: EmailConfig; expiresAt: number };
const configCache = new Map<string, ConfigCacheEntry>();

export function invalidateEmailConfigCache() {
  configCache.clear();
}
const CACHE_TTL_MS = 60_000;

async function loadEmailConfigCached(workspaceId?: string): Promise<EmailConfig> {
  try {
    const resolvedWorkspaceId = workspaceId ?? (await requireTenantContext()).workspaceId;
    const cached = configCache.get(resolvedWorkspaceId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.config;
    }
    const config = await getResolvedEmailConfig(resolvedWorkspaceId);
    configCache.set(resolvedWorkspaceId, { config, expiresAt: Date.now() + CACHE_TTL_MS });
    return config;
  } catch {
    return getResolvedEmailConfig();
  }
}

function resolveRecipient(config: EmailConfig, leadAddress: string): string {
  if (config.sendMode === "test") {
    if (!config.testRecipient.trim()) {
      throw new Error("Test recipient is required to send in test mode");
    }
    return config.testRecipient.trim();
  }
  return leadAddress;
}

export async function sendEmail(params: SendParams & { workspaceId?: string }): Promise<SendResult> {
  const config = await loadEmailConfigCached(params.workspaceId);
  const mode = config.sendMode;
  const from = formatFromAddress(config);
  const timestamp = new Date().toISOString();
  const transport = transports[config.provider];

  const preflightErrors = validateEmailConfig(config, { forSend: true });
  if (preflightErrors.length > 0) {
    throw new Error(preflightErrors.join("; "));
  }

  if (mode === "dry_run") {
    console.log("[email:dry_run]", {
      provider: config.provider,
      to: params.to,
      subject: params.subject,
      from,
    });
    return {
      mode,
      provider: config.provider,
      to: params.to,
      subject: params.subject,
      timestamp,
    };
  }

  const to = resolveRecipient(config, params.to);
  return transport.send(params, config, to);
}

import type { EmailConfig } from "@/lib/email/config";
import { checkDomainAuth, type DomainAuthResult, isPersonalInboxDomain } from "@/lib/email/sender-dns";
import { assertVolumeWithinCap, countSendsLast24h } from "@/lib/email/sender-volume";
import { getWorkspaceBounceStats, type BounceStats } from "@/lib/email/sender-bounce-rate";
import { setOutreachPaused } from "@/lib/settings/email-settings";

export type SenderIssueSeverity = "info" | "warn" | "critical";

export type SenderIssue = {
  id: string;
  label: string;
  severity: SenderIssueSeverity;
};

export type SenderHealthResult = {
  issues: SenderIssue[];
  domainAuth: DomainAuthResult;
  sendsLast24h: number;
  dailyCap: number;
  projectedAdditional: number;
  bounceStats: BounceStats;
  personalInboxSender: boolean;
  canSendLive: boolean;
  hasCritical: boolean;
};

export class SenderPreflightError extends Error {
  code = "SENDER_PREFLIGHT_FAILED" as const;
  issues: SenderIssue[];
  canOverride: boolean;

  constructor(issues: SenderIssue[], canOverride = true) {
    super(issues.map((i) => i.label).join("; "));
    this.name = "SenderPreflightError";
    this.issues = issues;
    this.canOverride = canOverride;
  }
}

function buildDnsIssues(auth: DomainAuthResult): SenderIssue[] {
  const issues: SenderIssue[] = [];

  if (auth.status === "unsupported") {
    issues.push({
      id: "personal_inbox",
      label:
        "Personal email providers can't be authenticated for bulk outreach. Use a dedicated sending domain.",
      severity: "critical",
    });
    return issues;
  }

  const { spf, dmarc, dkim } = auth.checks;

  if (!spf.valid) {
    issues.push({
      id: "spf",
      label: spf.warning
        ? `SPF problem for ${auth.domain}: ${spf.warning}`
        : spf.error
          ? `Could not look up SPF for ${auth.domain} (${spf.error})`
          : `No SPF record found for ${auth.domain}`,
      severity: "critical",
    });
  } else if (spf.warning) {
    issues.push({ id: "spf_soft", label: spf.warning, severity: "warn" });
  }

  if (!dmarc.valid) {
    issues.push({
      id: "dmarc",
      label: dmarc.error
        ? `Could not look up DMARC for ${auth.domain} (${dmarc.error})`
        : `No DMARC record found for ${auth.domain}`,
      severity: "critical",
    });
  } else if (dmarc.warning) {
    issues.push({ id: "dmarc_policy", label: dmarc.warning, severity: "warn" });
  }

  if (!dkim.valid) {
    issues.push({
      id: "dkim",
      label: dkim.note ?? `DKIM not detected for ${auth.domain}`,
      severity: "warn",
    });
  }

  return issues;
}

export type SenderHealthOptions = {
  /** Extra recipients about to send in this batch (counts against daily cap). */
  projectedAdditional?: number;
};

export async function runSenderHealthCheck(
  config: EmailConfig,
  workspaceId: string,
  options?: SenderHealthOptions,
): Promise<SenderHealthResult> {
  const fromAddress = config.fromAddress || config.smtpUser;
  const dailyCap = config.dailySendCapPerDomain ?? 50;
  const projectedAdditional = Math.max(0, options?.projectedAdditional ?? 0);

  const [domainAuth, sendsLast24h, bounceStats] = await Promise.all([
    checkDomainAuth(fromAddress, { dkimSelector: config.dkimSelector }),
    countSendsLast24h(workspaceId, fromAddress ?? ""),
    getWorkspaceBounceStats(workspaceId),
  ]);

  const personalInboxSender = isPersonalInboxDomain(fromAddress ?? "");
  const issues = buildDnsIssues(domainAuth);

  if (personalInboxSender && domainAuth.status !== "unsupported") {
    issues.push({
      id: "personal_inbox",
      label: "Sending from a personal inbox. Poor deliverability at volume",
      severity: "warn",
    });
  }

  const volume = assertVolumeWithinCap({
    sendsLast24h,
    dailyCap,
    projectedAdditional,
  });
  if (!volume.ok) {
    issues.push({
      id: "volume_cap",
      label:
        projectedAdditional > 0
          ? `Daily send cap would be exceeded (${volume.projectedTotal}/${dailyCap} including ${projectedAdditional} queued)`
          : `Daily send cap reached (${sendsLast24h}/${dailyCap} in last 24h)`,
      severity: "critical",
    });
  }

  if (bounceStats.exceedsThreshold) {
    const pct = (bounceStats.rate * 100).toFixed(1);
    const thresholdPct = (bounceStats.threshold * 100).toFixed(0);
    issues.push({
      id: "bounce_rate",
      label: `Bounce rate ${pct}% over last ${bounceStats.windowHours}h (${bounceStats.bounced}/${bounceStats.sent}) exceeds ${thresholdPct}% safety threshold. Outreach paused.`,
      severity: "critical",
    });
  }

  const hasCritical = issues.some((i) => i.severity === "critical");
  return {
    issues,
    domainAuth,
    sendsLast24h,
    dailyCap,
    projectedAdditional,
    bounceStats,
    personalInboxSender,
    canSendLive: !hasCritical,
    hasCritical,
  };
}

export async function assertSenderPreflight(
  config: EmailConfig,
  workspaceId: string,
  options?: SenderHealthOptions & { override?: boolean },
): Promise<SenderHealthResult> {
  const health = await runSenderHealthCheck(config, workspaceId, {
    projectedAdditional: options?.projectedAdditional,
  });

  if (
    config.sendMode === "live" &&
    health.bounceStats.exceedsThreshold &&
    !config.outreachPaused
  ) {
    try {
      await setOutreachPaused(true, workspaceId);
    } catch (err) {
      console.error("[sender-preflight] failed to auto-pause outreach", err);
    }
  }

  if (config.sendMode === "live" && health.hasCritical && !options?.override) {
    throw new SenderPreflightError(
      health.issues.filter((i) => i.severity === "critical"),
      // Bounce-rate pause should not be casually overridden
      !health.issues.some((i) => i.id === "bounce_rate"),
    );
  }
  return health;
}

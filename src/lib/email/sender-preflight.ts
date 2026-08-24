import type { EmailConfig } from "@/lib/email/config";
import { checkDomainAuth, type DomainAuthResult, isPersonalInboxDomain } from "@/lib/email/sender-dns";
import {
  assertGradualRamp,
  assertVolumeWithinCap,
  recommendedDailyCap,
  remainingDailyQuota,
  warmupCapWarning,
} from "@/lib/email/sender-warmup";
import { countSendsInRange, countSendsLast24h } from "@/lib/email/sender-volume";
import { getWorkspaceBounceStats, type BounceStats } from "@/lib/email/sender-bounce-rate";
import { setOutreachPaused } from "@/lib/settings/email-settings";

export type SenderIssueSeverity = "info" | "warn" | "critical";

export type SenderIssue = {
  id: string;
  label: string;
  severity: SenderIssueSeverity;
};

const NON_OVERRIDABLE_ISSUE_IDS = new Set(["bounce_rate", "volume_cap"]);

export type SenderHealthResult = {
  issues: SenderIssue[];
  domainAuth: DomainAuthResult;
  sendsLast24h: number;
  dailyCap: number;
  remainingToday: number;
  recommendedDailyCap: number;
  warmupStage: string;
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
  const rec = recommendedDailyCap({
    stage: config.inboxWarmupStage,
    warmupStartedAt: config.inboxWarmupStartedAt,
  });
  const dailyCap = config.dailySendCapPerDomain ?? rec.recommended;
  const projectedAdditional = Math.max(0, options?.projectedAdditional ?? 0);
  const now = Date.now();
  const last24hStart = new Date(now - 24 * 60 * 60 * 1000);
  const prior24hStart = new Date(now - 48 * 60 * 60 * 1000);

  const [domainAuth, sendsLast24h, sendsPrior24h, bounceStats] = await Promise.all([
    checkDomainAuth(fromAddress, { dkimSelector: config.dkimSelector }),
    countSendsLast24h(workspaceId, fromAddress ?? ""),
    countSendsInRange(workspaceId, fromAddress ?? "", prior24hStart, last24hStart),
    getWorkspaceBounceStats(workspaceId),
  ]);

  const remainingToday = remainingDailyQuota(sendsLast24h, dailyCap);
  const personalInboxSender = isPersonalInboxDomain(fromAddress ?? "");
  const issues = buildDnsIssues(domainAuth);

  if (personalInboxSender && domainAuth.status !== "unsupported") {
    issues.push({
      id: "personal_inbox",
      label: "Sending from a personal inbox. Poor deliverability at volume",
      severity: "warn",
    });
  }

  const highCap = warmupCapWarning(dailyCap, rec);
  if (highCap) {
    issues.push({ id: "warmup_cap_high", label: highCap, severity: "warn" });
  }

  const volume = assertVolumeWithinCap({
    sendsLast24h,
    dailyCap,
    projectedAdditional,
  });
  if (!volume.ok) {
    const remainingLabel =
      remainingToday === 0
        ? `Daily send quota is used up (0 remaining of ${dailyCap} today). Wait until tomorrow, or raise the daily cap in Settings → Email if this inbox is warmed.`
        : projectedAdditional > 0
          ? `Daily send cap would be exceeded (${volume.projectedTotal}/${dailyCap} including ${projectedAdditional} queued, ${remainingToday} remaining).`
          : `Daily send cap reached (${sendsLast24h}/${dailyCap} in last 24h).`;
    issues.push({
      id: "volume_cap",
      label: remainingLabel,
      severity: "critical",
    });
  } else if (projectedAdditional > 0) {
    if (volume.projectedTotal > rec.max) {
      issues.push({
        id: "warmup_recommend",
        label:
          rec.stage === "new"
            ? `This batch would send ${volume.projectedTotal} today. New inboxes should stay at 20–40/day for the first 2–4 weeks.`
            : `This batch would send ${volume.projectedTotal} today. Recommended for a ${rec.stage} inbox is ${rec.min}–${rec.max}/day.`,
        severity: "critical",
      });
    } else {
      const ramp = assertGradualRamp({
        sendsPrior24h,
        projectedTotal: volume.projectedTotal,
        projectedAdditional,
        recommended: rec,
      });
      if (!ramp.ok) {
        issues.push({
          id: "warmup_spike",
          label: `Avoid a sudden spike: this batch would bring today to ${volume.projectedTotal} sends (prior day ${sendsPrior24h}). Scale gradually, stay near ${ramp.allowedToday}/day, then confirm if you still need to send.`,
          severity: "critical",
        });
      }
    }
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
    remainingToday,
    recommendedDailyCap: rec.recommended,
    warmupStage: rec.stage,
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

  const critical = health.issues.filter((i) => i.severity === "critical");
  const canOverride =
    critical.length > 0 && critical.every((i) => !NON_OVERRIDABLE_ISSUE_IDS.has(i.id));

  if (config.sendMode === "live" && critical.length > 0 && !(options?.override && canOverride)) {
    throw new SenderPreflightError(critical, canOverride);
  }
  return health;
}

import type { EmailConfig } from "@/lib/email/config";
import { checkDomainAuth, type DomainAuthResult, isPersonalInboxDomain } from "@/lib/email/sender-dns";
import { countSendsLast24h } from "@/lib/email/sender-volume";

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
      label: `No SPF record found for ${auth.domain}`,
      severity: "critical",
    });
  }
  if (!dmarc.valid) {
    issues.push({
      id: "dmarc",
      label: `No DMARC record found for ${auth.domain}`,
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

export async function runSenderHealthCheck(
  config: EmailConfig,
  workspaceId: string,
): Promise<SenderHealthResult> {
  const fromAddress = config.fromAddress || config.smtpUser;
  const dailyCap = config.dailySendCapPerDomain ?? 50;
  const [domainAuth, sendsLast24h] = await Promise.all([
    checkDomainAuth(fromAddress, { dkimSelector: config.dkimSelector }),
    countSendsLast24h(workspaceId, fromAddress),
  ]);

  const personalInboxSender = isPersonalInboxDomain(fromAddress);
  const issues = buildDnsIssues(domainAuth);

  if (personalInboxSender && domainAuth.status !== "unsupported") {
    issues.push({
      id: "personal_inbox",
      label: "Sending from a personal inbox — poor deliverability at volume",
      severity: "warn",
    });
  }

  if (sendsLast24h >= dailyCap) {
    issues.push({
      id: "volume_cap",
      label: `Daily send cap reached (${sendsLast24h}/${dailyCap} in last 24h)`,
      severity: "critical",
    });
  }

  const hasCritical = issues.some((i) => i.severity === "critical");
  return {
    issues,
    domainAuth,
    sendsLast24h,
    dailyCap,
    personalInboxSender,
    canSendLive: !hasCritical,
    hasCritical,
  };
}

export async function assertSenderPreflight(
  config: EmailConfig,
  workspaceId: string,
  options?: { override?: boolean },
): Promise<SenderHealthResult> {
  const health = await runSenderHealthCheck(config, workspaceId);

  if (config.sendMode === "live" && health.hasCritical && !options?.override) {
    throw new SenderPreflightError(
      health.issues.filter((i) => i.severity === "critical"),
      true,
    );
  }
  return health;
}

import { promises as dns } from "dns";
import rulesConfig from "@/lib/email/content-rules.config.json";

export type SpfCheck = {
  found: boolean;
  valid: boolean;
  record?: string;
  /** Soft issues (missing ~all/-all, etc.) */
  warning?: string | null;
  /** Trailing all mechanism: -all | ~all | +all | ?all */
  allMechanism?: string | null;
  error?: string;
};

export type DmarcCheck = {
  found: boolean;
  valid: boolean;
  record?: string;
  policy?: string | null;
  warning?: string | null;
  /** Aggregate report URI present (rua=) */
  hasRua?: boolean;
  info?: string | null;
  error?: string;
};

export type DkimCheck = {
  found: boolean;
  valid: boolean;
  selector?: string;
  record?: string;
  note?: string;
  error?: string;
};

export type DomainAuthStatus = "pass" | "partial" | "fail" | "unsupported";

export type DomainAuthResult = {
  domain: string;
  status: DomainAuthStatus;
  label: string;
  passCount: number;
  checks: { spf: SpfCheck; dmarc: DmarcCheck; dkim: DkimCheck };
};

/** @deprecated use DomainAuthResult — flat booleans kept for API compat */
export type DnsAuthResult = DomainAuthResult & {
  spf: boolean;
  dmarc: boolean;
  dkim: boolean | null;
};

export function extractDomain(emailOrDomain: string): string {
  const trimmed = emailOrDomain.trim().toLowerCase();
  if (trimmed.includes("@")) return trimmed.split("@").pop() ?? trimmed;
  return trimmed;
}

export function isPersonalInboxDomain(emailOrDomain: string): boolean {
  const domain = extractDomain(emailOrDomain);
  return rulesConfig.personalInboxDomains.includes(domain);
}

/** Parse an SPF TXT value for validity and soft warnings (pure, testable). */
export function parseSpfRecord(record: string): SpfCheck {
  const trimmed = record.trim();
  if (!trimmed.toLowerCase().startsWith("v=spf1")) {
    return { found: false, valid: false };
  }

  const tokens = trimmed.split(/\s+/);
  const allToken = tokens.find((t) => /^[+\-~?]?all$/i.test(t));

  let normalizedAll: string | null = null;
  if (allToken) {
    const m = allToken.match(/^([+\-~?]?)all$/i);
    const qualifier = m?.[1];
    normalizedAll = `${!qualifier || qualifier === "" ? "+" : qualifier}all`;
  }

  let warning: string | null = null;
  let valid = true;

  if (normalizedAll === "+all") {
    valid = false;
    warning = 'SPF ends with "+all" (allows any sender). Use ~all or -all.';
  } else if (!normalizedAll) {
    warning = "SPF has no trailing all mechanism (~all / -all recommended)";
  }

  return {
    found: true,
    valid,
    record: trimmed,
    allMechanism: normalizedAll,
    warning,
  };
}

/** Parse a DMARC TXT value (pure, testable). */
export function parseDmarcRecord(record: string): DmarcCheck {
  const trimmed = record.trim();
  if (!trimmed.toLowerCase().startsWith("v=dmarc1")) {
    return { found: false, valid: false };
  }

  const policyMatch = trimmed.match(/(?:^|;)\s*p=(\w+)/i);
  const policy = policyMatch ? policyMatch[1].toLowerCase() : null;
  const hasRua = /(?:^|;)\s*rua=/i.test(trimmed);

  const warnings: string[] = [];
  if (policy === "none") {
    warnings.push('Policy is "none" (monitoring only, not enforcing)');
  }
  if (!hasRua) {
    warnings.push("No rua= aggregate reporting URI configured");
  }

  return {
    found: true,
    valid: true,
    record: trimmed,
    policy,
    hasRua,
    warning: warnings.length ? warnings.join("; ") : null,
    info: hasRua ? "Aggregate reports (rua) configured" : null,
  };
}

async function checkSPF(domain: string): Promise<SpfCheck> {
  try {
    const records = await dns.resolveTxt(domain);
    const flat = records.map((parts) => parts.join(""));
    const spf = flat.find((r) => r.toLowerCase().startsWith("v=spf1"));
    if (!spf) return { found: false, valid: false };
    return parseSpfRecord(spf);
  } catch (e) {
    const code = e && typeof e === "object" && "code" in e ? String((e as { code: string }).code) : undefined;
    return { found: false, valid: false, error: code };
  }
}

async function checkDMARC(domain: string): Promise<DmarcCheck> {
  try {
    const records = await dns.resolveTxt(`_dmarc.${domain}`);
    const flat = records.map((parts) => parts.join(""));
    const dmarc = flat.find((r) => r.toLowerCase().startsWith("v=dmarc1"));
    if (!dmarc) return { found: false, valid: false };
    return parseDmarcRecord(dmarc);
  } catch (e) {
    const code = e && typeof e === "object" && "code" in e ? String((e as { code: string }).code) : undefined;
    return { found: false, valid: false, error: code };
  }
}

async function checkDKIM(domain: string, selector?: string | null): Promise<DkimCheck> {
  const candidates = selector
    ? [selector]
    : [...new Set([...rulesConfig.dkimSelectors, "mail", "default", "google", "k1"])];

  for (const sel of candidates) {
    try {
      const records = await dns.resolveTxt(`${sel}._domainkey.${domain}`);
      const flat = records.map((parts) => parts.join(""));
      const dkim = flat.find((r) => r.toLowerCase().includes("v=dkim1"));
      if (dkim) {
        return {
          found: true,
          valid: true,
          selector: sel,
          record: dkim.slice(0, 120),
        };
      }
    } catch {
      continue;
    }
  }

  return {
    found: false,
    valid: false,
    note: "No DKIM found at common selectors. Confirm the selector with your ESP",
  };
}

export async function checkDomainAuth(
  emailOrDomain: string,
  options?: { dkimSelector?: string | null },
): Promise<DomainAuthResult> {
  const domain = extractDomain(emailOrDomain);

  if (isPersonalInboxDomain(domain)) {
    return {
      domain,
      status: "unsupported",
      label: "Personal email provider. Cannot authenticate for bulk sending",
      passCount: 0,
      checks: {
        spf: { found: false, valid: false },
        dmarc: { found: false, valid: false },
        dkim: {
          found: false,
          valid: false,
          note: "DNS checks skipped for personal inbox providers",
        },
      },
    };
  }

  const [spf, dmarc, dkim] = await Promise.all([
    checkSPF(domain),
    checkDMARC(domain),
    checkDKIM(domain, options?.dkimSelector),
  ]);

  const passCount = [spf.valid, dmarc.valid, dkim.valid].filter(Boolean).length;

  let status: DomainAuthStatus;
  let label: string;
  if (passCount === 3) {
    status = "pass";
    label = "Fully authenticated";
  } else if (passCount >= 1) {
    status = "partial";
    label = "Partially authenticated. Fix gaps below";
  } else {
    status = "fail";
    label = "Not authenticated. High spam risk";
  }

  return { domain, status, label, passCount, checks: { spf, dmarc, dkim } };
}

/** Human-readable multi-line summary for CLI / logs. */
export function summarizeDomainAuth(auth: DomainAuthResult): string {
  const lines: string[] = [
    `Domain: ${auth.domain}`,
    `Status: ${auth.status} (${auth.label})`,
    "",
    `SPF:   ${auth.checks.spf.valid ? "PASS" : "FAIL"}${auth.checks.spf.record ? `  ${auth.checks.spf.record}` : ""}`,
  ];
  if (auth.checks.spf.warning) lines.push(`      warning: ${auth.checks.spf.warning}`);
  if (auth.checks.spf.allMechanism) lines.push(`      all: ${auth.checks.spf.allMechanism}`);

  lines.push(
    `DMARC: ${auth.checks.dmarc.valid ? "PASS" : "FAIL"}${auth.checks.dmarc.policy ? `  p=${auth.checks.dmarc.policy}` : ""}`,
  );
  if (auth.checks.dmarc.warning) lines.push(`      warning: ${auth.checks.dmarc.warning}`);
  if (auth.checks.dmarc.info) lines.push(`      info: ${auth.checks.dmarc.info}`);

  lines.push(
    `DKIM:  ${auth.checks.dkim.valid ? "PASS" : "FAIL"}${auth.checks.dkim.selector ? `  selector=${auth.checks.dkim.selector}` : ""}`,
  );
  if (auth.checks.dkim.note) lines.push(`      note: ${auth.checks.dkim.note}`);

  return lines.join("\n");
}

function toFlatDns(auth: DomainAuthResult): DnsAuthResult {
  return {
    ...auth,
    spf: auth.checks.spf.valid,
    dmarc: auth.checks.dmarc.valid,
    dkim: auth.checks.dkim.valid ? true : auth.checks.dkim.found ? false : null,
  };
}

export async function checkSenderDns(
  fromAddress: string,
  dkimSelector?: string | null,
): Promise<DnsAuthResult> {
  return toFlatDns(await checkDomainAuth(fromAddress, { dkimSelector }));
}

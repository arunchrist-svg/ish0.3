import { promises as dns } from "dns";
import rulesConfig from "@/lib/email/content-rules.config.json";

export type SpfCheck = {
  found: boolean;
  valid: boolean;
  record?: string;
  error?: string;
};

export type DmarcCheck = {
  found: boolean;
  valid: boolean;
  record?: string;
  policy?: string | null;
  warning?: string | null;
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

async function checkSPF(domain: string): Promise<SpfCheck> {
  try {
    const records = await dns.resolveTxt(domain);
    const flat = records.map((parts) => parts.join(""));
    const spf = flat.find((r) => r.toLowerCase().startsWith("v=spf1"));
    return spf
      ? { found: true, valid: true, record: spf }
      : { found: false, valid: false };
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

    const policyMatch = dmarc.match(/p=(\w+)/i);
    const policy = policyMatch ? policyMatch[1].toLowerCase() : null;
    return {
      found: true,
      valid: true,
      record: dmarc,
      policy,
      warning:
        policy === "none"
          ? 'Policy is "none" — monitoring only, not enforcing'
          : null,
    };
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
    note: "No DKIM found at common selectors — confirm the selector with your ESP",
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
      label: "Personal email provider — cannot authenticate for bulk sending",
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
    label = "Partially authenticated — fix gaps below";
  } else {
    status = "fail";
    label = "Not authenticated — high spam risk";
  }

  return { domain, status, label, passCount, checks: { spf, dmarc, dkim } };
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

import { knownDomainForCompanyName } from "@/lib/company-logo";
import { isUnusableCompanyDomain, normalizeHost } from "@/lib/enrichment/company-domain-quality";

export type WebsiteLiveStatus = "live" | "dead" | "unknown";

export type WebsiteProbeResult = {
  status: WebsiteLiveStatus;
  snippet?: string;
};

const probeCache = new Map<string, Promise<WebsiteProbeResult>>();

/** Statuses that mean "do not stamp this as a company website" for Scout. */
const DEAD_HTTP_STATUSES = new Set([403, 404, 410, 451, 520, 521, 522, 523, 524]);

const INDIA_TLD =
  /\.(in|co\.in|firm\.in|gen\.in|ind\.in|org\.in|net\.in|ernet\.in)$/i;

const INDIA_PAGE =
  /\b(india|bharat|bengaluru|bangalore|mumbai|delhi|hyderabad|chennai|kolkata|pune|karnataka|tamil\s*nadu|maharashtra|gstin|\+91|private limited|pvt\.?\s*ltd|cin\s*:|₹)\b/i;

const FOREIGN_PAGE =
  /\b(united states|u\.s\.a\.?|new zealand|australia|united kingdom|london|new york|california|auckland|wellington)\b/i;

export function isIndiaCompanyTld(domain?: string | null): boolean {
  const host = normalizeHost(domain);
  if (!host) return false;
  return INDIA_TLD.test(host);
}

export function websiteTextLooksIndian(text: string): boolean {
  return INDIA_PAGE.test(text);
}

export function websiteTextLooksForeignOnly(text: string): boolean {
  return FOREIGN_PAGE.test(text) && !websiteTextLooksIndian(text);
}

/**
 * Drop .com/.partners/etc. stamps that belong to another country even when the
 * slug loosely matches an Indian Pvt Ltd name.
 */
export function rejectNonIndianWebsiteStamp(params: {
  host?: string | null;
  companyName: string;
  snippet?: string;
}): boolean {
  const host = normalizeHost(params.host);
  if (!host) return false;
  if (isIndiaCompanyTld(host)) return false;
  const known = normalizeHost(knownDomainForCompanyName(params.companyName));
  if (known && host === known) return false;
  const snippet = params.snippet?.slice(0, 12_000) ?? "";
  if (!snippet) return false;
  if (websiteTextLooksIndian(snippet)) return false;
  return websiteTextLooksForeignOnly(snippet) || snippet.length > 200;
}

/**
 * Lightweight reachability check for scout website stamps.
 * - live: usable homepage response
 * - dead: DNS miss, connection fail, directory/builder host, or 403/404/410
 * - unknown: timeout / aborted — keep the domain rather than false-negative
 */
export async function probeCompanyWebsiteLive(
  domainOrUrl?: string | null,
  opts?: { timeoutMs?: number },
): Promise<WebsiteLiveStatus> {
  return (await probeCompanyWebsite(domainOrUrl, opts)).status;
}

export async function probeCompanyWebsite(
  domainOrUrl?: string | null,
  opts?: { timeoutMs?: number },
): Promise<WebsiteProbeResult> {
  const host = normalizeHost(domainOrUrl);
  if (!host || !host.includes(".")) return { status: "dead" };
  if (isUnusableCompanyDomain(host)) return { status: "dead" };

  const cached = probeCache.get(host);
  if (cached) return cached;

  const timeoutMs = opts?.timeoutMs ?? 3500;
  const promise = (async (): Promise<WebsiteProbeResult> => {
    const urls = [`https://${host}`, `https://www.${host}`, `http://${host}`];
    let sawUnknown = false;
    for (const url of urls) {
      try {
        const res = await fetch(url, {
          method: "GET",
          redirect: "follow",
          signal: AbortSignal.timeout(timeoutMs),
          headers: { "User-Agent": "NebulaScout/1.0 (+website-check)" },
        });
        if (DEAD_HTTP_STATUSES.has(res.status)) return { status: "dead" };
        if (res.status >= 200 && res.status < 400) {
          const snippet = await res.text().then((t) => t.slice(0, 12_000)).catch(() => "");
          return { status: "live", snippet };
        }
        if (res.status === 401 || res.status === 405 || res.status === 429) {
          return { status: "live" };
        }
        return { status: "dead" };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/abort|timeout|timed out/i.test(msg)) {
          sawUnknown = true;
          continue;
        }
        continue;
      }
    }
    return { status: sawUnknown ? "unknown" : "dead" };
  })();

  probeCache.set(host, promise);
  return promise;
}

export function clearWebsiteProbeCache(): void {
  probeCache.clear();
}

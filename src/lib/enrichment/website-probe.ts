import { isUnusableCompanyDomain, normalizeHost } from "@/lib/enrichment/company-domain-quality";

export type WebsiteLiveStatus = "live" | "dead" | "unknown";

const probeCache = new Map<string, Promise<WebsiteLiveStatus>>();

/** Statuses that mean "do not stamp this as a company website" for Scout. */
const DEAD_HTTP_STATUSES = new Set([403, 404, 410, 451, 520, 521, 522, 523, 524]);

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
  const host = normalizeHost(domainOrUrl);
  if (!host || !host.includes(".")) return "dead";
  // Never treat directory / free-builder hosts as live company sites.
  if (isUnusableCompanyDomain(host)) return "dead";

  const cached = probeCache.get(host);
  if (cached) return cached;

  const timeoutMs = opts?.timeoutMs ?? 3500;
  const promise = (async (): Promise<WebsiteLiveStatus> => {
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
        if (DEAD_HTTP_STATUSES.has(res.status)) return "dead";
        // 2xx / 3xx / other non-dead codes: host is answering with a real page.
        if (res.status >= 200 && res.status < 400) return "live";
        // 401/405/etc. still imply a real origin; keep as live.
        if (res.status === 401 || res.status === 405 || res.status === 429) return "live";
        return "dead";
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/abort|timeout|timed out/i.test(msg)) {
          sawUnknown = true;
          continue;
        }
        // ENOTFOUND / ECONNREFUSED / certificate failures → try next URL scheme
        continue;
      }
    }
    return sawUnknown ? "unknown" : "dead";
  })();

  probeCache.set(host, promise);
  return promise;
}

export function clearWebsiteProbeCache(): void {
  probeCache.clear();
}

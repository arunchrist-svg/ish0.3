import {
  domainSlug,
  isAcceptableCompanyDomain,
  normalizeHost,
} from "@/lib/enrichment/company-domain-quality";
import { compactCompanyName, nameMatchesQuery, normalizeCompanyName } from "@/lib/enrichment/company-name-match";
import { knownDomainForCompanyName } from "@/lib/company-logo";
import { domainFromWebsite } from "@/lib/enrichment/provider-utils";

const COMMON_TLDS = [".co.in", ".in", ".com"];

/** Brand slugs used to guess alternate corporate domains (titan vs titancompany). */
export function brandDomainSlugs(companyName: string): string[] {
  const slugs = new Set<string>();
  const normalized = normalizeCompanyName(companyName);
  const compact = compactCompanyName(companyName);
  if (compact.length >= 3) slugs.add(compact);
  const first = normalized.split(" ").filter(Boolean)[0];
  if (first && first.length >= 3) slugs.add(first);

  const softer = companyName
    .toLowerCase()
    .replace(/\b(pvt\.?\s*ltd\.?|private limited|limited|ltd\.?|llp|inc\.?|incorporated|corp(?:oration)?|plc)\b/gi, " ")
    .replace(/[^a-z0-9]+/g, "");
  if (softer.length >= 3 && softer.length <= 40) slugs.add(softer);

  return [...slugs];
}

export function companyDomainAliases(params: {
  companyName: string;
  domain?: string | null;
  extraDomains?: Array<string | null | undefined>;
}): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  const push = (raw?: string | null) => {
    const host = normalizeHost(raw);
    if (!host || seen.has(host)) return;
    if (!isAcceptableCompanyDomain(host, params.companyName)) return;
    seen.add(host);
    out.push(host);
  };

  push(params.domain);
  for (const extra of params.extraDomains ?? []) push(extra);

  const known = normalizeHost(knownDomainForCompanyName(params.companyName));
  push(known);

  for (const slug of brandDomainSlugs(params.companyName)) {
    for (const tld of COMMON_TLDS) {
      push(`${slug}${tld}`);
    }
  }

  return out.slice(0, 8);
}

export function pickBestOrganizationMatch(
  orgs: Array<{ name?: string; domain?: string; website?: string; employees?: string }>,
  companyName: string,
): { domain: string; website?: string } | undefined {
  let best: { domain: string; website?: string; score: number } | undefined;

  for (const org of orgs) {
    const domain = normalizeHost(org.domain) ?? domainFromWebsite(org.website);
    if (!domain || !isAcceptableCompanyDomain(domain, companyName)) continue;

    let score = 0;
    const orgName = org.name?.trim() ?? "";
    if (orgName && nameMatchesQuery(orgName, companyName)) score += 20;
    if (orgName && normalizeCompanyName(orgName) === normalizeCompanyName(companyName)) score += 15;

    const emp = Number.parseInt(String(org.employees ?? "").replace(/[^\d]/g, ""), 10);
    if (Number.isFinite(emp) && emp > 0) {
      score += Math.min(35, Math.log10(emp + 1) * 12);
    }

    const slug = domainSlug(domain) ?? "";
    const compact = compactCompanyName(companyName);
    const first = normalizeCompanyName(companyName).split(" ")[0] ?? "";
    if (slug && compact && slug === compact) score += 12;
    else if (slug && first && slug === first) score += 8;
    else if (slug && compact && (slug.includes(compact) || compact.includes(slug))) score += 5;

    if (!best || score > best.score) {
      best = { domain, website: org.website, score };
    }
  }

  return best ? { domain: best.domain, website: best.website } : undefined;
}

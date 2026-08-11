import { knownDomainForCompanyName } from "@/lib/company-logo";
import { apolloSearchOrganizationByName } from "./apollo";
import { companyDomainAliases, pickBestOrganizationMatch } from "./company-domain-aliases";
import { isAcceptableCompanyDomain, normalizeHost } from "./company-domain-quality";
import { domainFromWebsite } from "./provider-utils";
import { hasTavilyKeys } from "./tavily-keys";
import { tavilySearch } from "./tavily-client";

export function normalizeDomain(domain?: string | null): string | undefined {
  return normalizeHost(domain);
}

function isUsableForCompany(domain: string | undefined, companyName: string): domain is string {
  return Boolean(domain && isAcceptableCompanyDomain(domain, companyName));
}

export type ResolvedCompanyDomain = {
  domain?: string;
  website?: string;
  source: "provided" | "website" | "apollo" | "tavily" | "unresolved";
  aliases?: string[];
};

function withAliases(
  result: ResolvedCompanyDomain,
  companyName: string,
  extraDomains: Array<string | null | undefined> = [],
): ResolvedCompanyDomain {
  if (!result.domain) return result;
  return {
    ...result,
    aliases: companyDomainAliases({
      companyName,
      domain: result.domain,
      extraDomains,
    }),
  };
}

export async function resolveCompanyDomain(params: {
  companyName: string;
  domain?: string;
  website?: string;
  city?: string;
  /** When false, skip Apollo/Tavily lookups (LinkedIn name search does not need a domain). */
  allowExternal?: boolean;
}): Promise<ResolvedCompanyDomain> {
  const provided = normalizeDomain(params.domain);
  if (isUsableForCompany(provided, params.companyName)) {
    return withAliases({ domain: provided, website: params.website, source: "provided" }, params.companyName);
  }

  const fromWebsite = domainFromWebsite(params.website);
  if (isUsableForCompany(fromWebsite, params.companyName)) {
    return withAliases(
      { domain: fromWebsite, website: params.website, source: "website" },
      params.companyName,
    );
  }

  const knownEarly = normalizeDomain(knownDomainForCompanyName(params.companyName));
  if (isUsableForCompany(knownEarly, params.companyName)) {
    return withAliases(
      { domain: knownEarly, website: params.website ?? `https://${knownEarly}`, source: "provided" },
      params.companyName,
    );
  }

  if (params.allowExternal === false) {
    return { domain: undefined, website: params.website, source: "unresolved" };
  }

  if (process.env.APOLLO_API_KEY && params.companyName.trim()) {
    try {
      // Do not hard-filter Apollo orgs by scout/plant city. Titan HQ is Bengaluru
      // even when the scout city is Hosur.
      const orgs = await apolloSearchOrganizationByName({
        name: params.companyName,
        limit: 8,
      });
      const match = pickBestOrganizationMatch(orgs, params.companyName);
      if (match?.domain) {
        return withAliases(
          { domain: match.domain, website: match.website ?? params.website, source: "apollo" },
          params.companyName,
          orgs.map((org) => org.domain),
        );
      }
    } catch (e) {
      console.warn("[resolveCompanyDomain] Apollo org search failed", e);
    }
  }

  if (hasTavilyKeys() && params.companyName.trim()) {
    try {
      const cityHint = params.city ? ` ${params.city}` : " India";
      const hits = await tavilySearch(`"${params.companyName}" official website${cityHint}`, 5);
      for (const hit of hits) {
        const domain = domainFromWebsite(hit.url);
        if (isUsableForCompany(domain, params.companyName)) {
          return withAliases({ domain, website: hit.url, source: "tavily" }, params.companyName);
        }
      }
    } catch (e) {
      console.warn("[resolveCompanyDomain] Tavily domain search failed", e);
    }
  }

  const known = normalizeDomain(knownDomainForCompanyName(params.companyName));
  if (isUsableForCompany(known, params.companyName)) {
    return withAliases(
      { domain: known, website: params.website ?? `https://${known}`, source: "provided" },
      params.companyName,
    );
  }

  return { domain: undefined, website: params.website, source: "unresolved" };
}

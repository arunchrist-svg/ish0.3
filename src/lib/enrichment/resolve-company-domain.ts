import { apolloSearchOrganizationByName } from "./apollo";
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
};

export async function resolveCompanyDomain(params: {
  companyName: string;
  domain?: string;
  website?: string;
  city?: string;
}): Promise<ResolvedCompanyDomain> {
  const provided = normalizeDomain(params.domain);
  if (isUsableForCompany(provided, params.companyName)) {
    return { domain: provided, website: params.website, source: "provided" };
  }

  const fromWebsite = domainFromWebsite(params.website);
  if (isUsableForCompany(fromWebsite, params.companyName)) {
    return { domain: fromWebsite, website: params.website, source: "website" };
  }

  if (process.env.APOLLO_API_KEY && params.companyName.trim()) {
    try {
      const orgs = await apolloSearchOrganizationByName({
        name: params.companyName,
        city: params.city,
        limit: 3,
      });
      const match = orgs.find((org) => isUsableForCompany(normalizeDomain(org.domain), params.companyName));
      const domain = normalizeDomain(match?.domain);
      if (isUsableForCompany(domain, params.companyName)) {
        return { domain, website: match?.website ?? params.website, source: "apollo" };
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
          return { domain, website: hit.url, source: "tavily" };
        }
      }
    } catch (e) {
      console.warn("[resolveCompanyDomain] Tavily domain search failed", e);
    }
  }

  return { domain: undefined, website: params.website, source: "unresolved" };
}

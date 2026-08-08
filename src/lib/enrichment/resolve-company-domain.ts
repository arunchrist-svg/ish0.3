import { apolloSearchOrganizationByName } from "./apollo";
import { domainFromWebsite } from "./provider-utils";
import { hasTavilyKeys } from "./tavily-keys";
import { tavilySearch } from "./tavily-client";

const DIRECTORY_DOMAINS = [
  "justdial.com",
  "indiamart.com",
  "sulekha.com",
  "zaubacorp.com",
  "tradeindia.com",
  "linkedin.com",
  "facebook.com",
  "instagram.com",
  "twitter.com",
  "x.com",
  "youtube.com",
  "wikipedia.org",
  "google.com",
  "apollo.io",
  "github.com",
  "gitlab.com",
  "bitbucket.org",
];

export function normalizeDomain(domain?: string | null): string | undefined {
  if (!domain?.trim()) return undefined;
  return domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0];
}

function isDirectoryDomain(domain: string): boolean {
  const lower = domain.toLowerCase();
  return DIRECTORY_DOMAINS.some((dir) => lower === dir || lower.endsWith(`.${dir}`));
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
  if (provided) {
    return { domain: provided, website: params.website, source: "provided" };
  }

  const fromWebsite = domainFromWebsite(params.website);
  if (fromWebsite) {
    return { domain: fromWebsite, website: params.website, source: "website" };
  }

  if (process.env.APOLLO_API_KEY && params.companyName.trim()) {
    try {
      const orgs = await apolloSearchOrganizationByName({
        name: params.companyName,
        city: params.city,
        limit: 3,
      });
      const match = orgs.find((org) => normalizeDomain(org.domain)) ?? orgs[0];
      const domain = normalizeDomain(match?.domain);
      if (domain) {
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
        if (domain && !isDirectoryDomain(domain)) {
          return { domain, website: hit.url, source: "tavily" };
        }
      }
    } catch (e) {
      console.warn("[resolveCompanyDomain] Tavily domain search failed", e);
    }
  }

  return { domain: undefined, website: params.website, source: "unresolved" };
}

import { knownDomainForCompanyName } from "@/lib/company-logo";
import { apolloSearchOrganizationByName } from "./apollo";
import { companyDomainAliases, pickBestOrganizationMatch } from "./company-domain-aliases";
import { isAcceptableCompanyDomain, normalizeHost } from "./company-domain-quality";
import { domainFromCompany, domainFromWebsite } from "./provider-utils";
import { hasTavilyKeys } from "./tavily-keys";
import { tavilySearch } from "./tavily-client";

export function normalizeDomain(domain?: string | null): string | undefined {
  return normalizeHost(domain);
}

function isUsableForCompany(domain: string | undefined, companyName: string): domain is string {
  return Boolean(domain && isAcceptableCompanyDomain(domain, companyName));
}

/** Keep an official URL when it matches the resolved host; never keep directories or social. */
function officialWebsiteForDomain(
  domain: string,
  website: string | undefined,
  companyName: string,
): string {
  const fromSite = domainFromWebsite(website);
  if (isUsableForCompany(fromSite, companyName) && fromSite === domain && website?.trim()) {
    const raw = website.trim();
    return raw.startsWith("http") ? raw : `https://${raw}`;
  }
  return `https://www.${domain}`;
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
  const known = normalizeDomain(knownDomainForCompanyName(params.companyName));
  const naiveGuess = domainFromCompany(params.companyName);
  const provided = normalizeDomain(params.domain);
  if (isUsableForCompany(provided, params.companyName)) {
    // Prefer curated domains over naive slug guesses stored on the account.
    if (known && provided === naiveGuess && known !== naiveGuess) {
      return withAliases(
        {
          domain: known,
          website: officialWebsiteForDomain(known, params.website, params.companyName),
          source: "provided",
        },
        params.companyName,
        [provided],
      );
    }
    return withAliases(
      {
        domain: provided,
        website: officialWebsiteForDomain(provided, params.website, params.companyName),
        source: "provided",
      },
      params.companyName,
    );
  }

  const fromWebsite = domainFromWebsite(params.website);
  if (isUsableForCompany(fromWebsite, params.companyName)) {
    if (known && fromWebsite === naiveGuess && known !== naiveGuess) {
      return withAliases(
        {
          domain: known,
          website: officialWebsiteForDomain(known, undefined, params.companyName),
          source: "provided",
        },
        params.companyName,
        [fromWebsite],
      );
    }
    return withAliases(
      {
        domain: fromWebsite,
        website: officialWebsiteForDomain(fromWebsite, params.website, params.companyName),
        source: "website",
      },
      params.companyName,
    );
  }

  if (isUsableForCompany(known, params.companyName)) {
    return withAliases(
      {
        domain: known,
        website: officialWebsiteForDomain(known, params.website, params.companyName),
        source: "provided",
      },
      params.companyName,
    );
  }

  if (params.allowExternal === false) {
    return { domain: undefined, website: undefined, source: "unresolved" };
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
          {
            domain: match.domain,
            website: officialWebsiteForDomain(
              match.domain,
              match.website ?? params.website,
              params.companyName,
            ),
            source: "apollo",
          },
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
          return withAliases(
            {
              domain,
              website: officialWebsiteForDomain(domain, hit.url, params.companyName),
              source: "tavily",
            },
            params.companyName,
          );
        }
      }
    } catch (e) {
      console.warn("[resolveCompanyDomain] Tavily domain search failed", e);
    }
  }

  return { domain: undefined, website: undefined, source: "unresolved" };
}

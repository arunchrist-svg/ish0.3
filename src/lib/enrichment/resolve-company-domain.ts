import { knownDomainForCompanyName } from "@/lib/company-logo";
import { apolloSearchOrganizationByName } from "./apollo";
import { companyDomainAliases, pickBestOrganizationMatch } from "./company-domain-aliases";
import { isAcceptableCompanyDomain, isUnusableCompanyDomain, normalizeHost } from "./company-domain-quality";
import { domainFromCompany, domainFromWebsite } from "./provider-utils";
import { hasTavilyKeys } from "./tavily-keys";
import { tavilySearch } from "./tavily-client";

export function normalizeDomain(domain?: string | null): string | undefined {
  return normalizeHost(domain);
}

function isUsableForCompany(domain: string | undefined, companyName: string): domain is string {
  return Boolean(domain && isAcceptableCompanyDomain(domain, companyName));
}

/** Stored or pasted hosts: drop Zauba/IndiaMART, keep a real site even if the slug differs. */
function isKeepableProvidedHost(domain: string | undefined): domain is string {
  return Boolean(domain && !isUnusableCompanyDomain(domain));
}

const URL_IN_TEXT = /https?:\/\/[^\s"'<>)\]]+/gi;
const LABELED_SITE =
  /(?:official\s+)?(?:web\s*)?site\s*(?:is|:|-)?\s*(?:https?:\/\/)?((?:www\.)?[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z]{2,})+)/gi;
const WWW_HOST = /\bwww\.[a-z0-9][a-z0-9.-]+\.[a-z]{2,}\b/gi;

export function extractOfficialWebsiteFromHits(
  hits: { title: string; url: string; content: string }[],
  companyName: string,
): { domain: string; website: string } | undefined {
  const candidates: string[] = [];
  for (const hit of hits) {
    candidates.push(hit.url);
    const blob = `${hit.title}\n${hit.content}`;
    for (const match of blob.match(URL_IN_TEXT) ?? []) candidates.push(match);
    for (const match of blob.matchAll(LABELED_SITE)) {
      if (match[1]) candidates.push(match[1]);
    }
    for (const match of blob.match(WWW_HOST) ?? []) candidates.push(match);
  }

  for (const raw of candidates) {
    const domain = domainFromWebsite(raw) ?? normalizeDomain(raw);
    if (isUsableForCompany(domain, companyName)) {
      return { domain, website: officialWebsiteForDomain(domain, raw, companyName) };
    }
  }
  return undefined;
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
  if (isKeepableProvidedHost(provided)) {
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
  if (isKeepableProvidedHost(fromWebsite)) {
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
    const cityHint = params.city?.trim();
    const naiveGuessHost = normalizeDomain(domainFromCompany(params.companyName));
    const queries = [
      // Match what humans type in Google: "Aron Universal" Bangalore / official website.
      `"${params.companyName}" official website`,
      cityHint
        ? `"${params.companyName}" ${cityHint}`
        : `"${params.companyName}" India website`,
      `"${params.companyName}" (website OR "official site") -site:zaubacorp.com -site:indiamart.com -site:linkedin.com`,
    ];
    if (naiveGuessHost && isUsableForCompany(naiveGuessHost, params.companyName)) {
      queries.push(`site:${naiveGuessHost} "${params.companyName}"`);
    }
    try {
      for (const query of queries) {
        const hits = await tavilySearch(query, 5);
        const found = extractOfficialWebsiteFromHits(hits, params.companyName);
        if (found) {
          return withAliases({ ...found, source: "tavily" }, params.companyName);
        }
        // Name-slug domains (aronuniversal.com) often are correct; accept when Tavily
        // actually returned a hit from that host for this company name.
        if (
          naiveGuessHost &&
          isUsableForCompany(naiveGuessHost, params.companyName) &&
          hits.some((hit) => domainFromWebsite(hit.url) === naiveGuessHost)
        ) {
          return withAliases(
            {
              domain: naiveGuessHost,
              website: officialWebsiteForDomain(naiveGuessHost, `https://www.${naiveGuessHost}`, params.companyName),
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

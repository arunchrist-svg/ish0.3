import { knownDomainForCompanyName } from "@/lib/company-logo";
import { apolloSearchOrganizationByName } from "./apollo";
import { companyDomainAliases, pickBestOrganizationMatch } from "./company-domain-aliases";
import { isAcceptableCompanyDomain, isUnusableCompanyDomain, normalizeHost } from "./company-domain-quality";
import { domainFromCompany, domainFromWebsite } from "./provider-utils";
import { hasTavilyKeys } from "./tavily-keys";
import { tavilySearch } from "./tavily-client";
import { probeCompanyWebsiteLive } from "./website-probe";

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

async function acceptIfLive(
  result: ResolvedCompanyDomain,
  companyName: string,
  extraDomains: Array<string | null | undefined> = [],
  requireLive = true,
): Promise<ResolvedCompanyDomain | null> {
  if (!result.domain) return null;
  // Drop clearly dead hosts (410 Gone / NXDOMAIN). Timeouts stay unknown and are kept.
  if (requireLive) {
    const status = await probeCompanyWebsiteLive(result.domain);
    if (status === "dead") return null;
  }
  return withAliases(result, companyName, extraDomains);
}

export async function resolveCompanyDomain(params: {
  companyName: string;
  domain?: string;
  website?: string;
  city?: string;
  /** When false, skip Apollo/Tavily lookups (LinkedIn name search does not need a domain). */
  allowExternal?: boolean;
  /** Keep Apollo organization lookup available while preventing an implicit Tavily lookup. */
  allowTavily?: boolean;
}): Promise<ResolvedCompanyDomain> {
  // Unit tests and offline callers pass allowExternal:false — skip live probes there.
  const requireLive = params.allowExternal !== false;
  const known = normalizeDomain(knownDomainForCompanyName(params.companyName));
  const naiveGuess = domainFromCompany(params.companyName);
  const provided = normalizeDomain(params.domain);
  if (isKeepableProvidedHost(provided)) {
    // Prefer curated domains over naive slug guesses stored on the account.
    if (known && provided === naiveGuess && known !== naiveGuess) {
      const curated = await acceptIfLive(
        {
          domain: known,
          website: officialWebsiteForDomain(known, params.website, params.companyName),
          source: "provided",
        },
        params.companyName,
        [provided],
        requireLive,
      );
      if (curated) return curated;
    }
    const kept = await acceptIfLive(
      {
        domain: provided,
        website: officialWebsiteForDomain(provided, params.website, params.companyName),
        source: "provided",
      },
      params.companyName,
      [],
      requireLive,
    );
    if (kept) return kept;
  }

  const fromWebsite = domainFromWebsite(params.website);
  if (isKeepableProvidedHost(fromWebsite)) {
    if (known && fromWebsite === naiveGuess && known !== naiveGuess) {
      const curated = await acceptIfLive(
        {
          domain: known,
          website: officialWebsiteForDomain(known, undefined, params.companyName),
          source: "provided",
        },
        params.companyName,
        [fromWebsite],
        requireLive,
      );
      if (curated) return curated;
    }
    const kept = await acceptIfLive(
      {
        domain: fromWebsite,
        website: officialWebsiteForDomain(fromWebsite, params.website, params.companyName),
        source: "website",
      },
      params.companyName,
      [],
      requireLive,
    );
    if (kept) return kept;
  }

  if (isUsableForCompany(known, params.companyName)) {
    const curated = await acceptIfLive(
      {
        domain: known,
        website: officialWebsiteForDomain(known, params.website, params.companyName),
        source: "provided",
      },
      params.companyName,
      [],
      requireLive,
    );
    if (curated) return curated;
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
        const accepted = await acceptIfLive(
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
        if (accepted) return accepted;
      }
    } catch (e) {
      console.warn("[resolveCompanyDomain] Apollo org search failed", e);
    }
  }

  if (params.allowTavily !== false && hasTavilyKeys() && params.companyName.trim()) {
    const cityHint = params.city?.trim();
    const naiveGuessHost = normalizeDomain(domainFromCompany(params.companyName));
    const queries = [
      // Match what humans type in Google: "Aron Universal" Bangalore / official website.
      `"${params.companyName}" official website`,
      cityHint
        ? `"${params.companyName}" ${cityHint}`
        : `"${params.companyName}" India website`,
      `"${params.companyName}" (website OR "official site") -site:zaubacorp.com -site:indiamart.com -site:linkedin.com -site:justdial.com -site:wixsite.com -site:idbf.in`,
    ];
    if (naiveGuessHost && isUsableForCompany(naiveGuessHost, params.companyName)) {
      queries.push(`site:${naiveGuessHost} "${params.companyName}"`);
    }
    try {
      for (const query of queries) {
        const hits = await tavilySearch(query, 5);
        const found = extractOfficialWebsiteFromHits(hits, params.companyName);
        if (found) {
          const accepted = await acceptIfLive(
            { ...found, source: "tavily" },
            params.companyName,
          );
          if (accepted) return accepted;
        }
        // Name-slug domains (aronuniversal.com) often are correct; accept when Tavily
        // actually returned a hit from that host for this company name.
        if (
          naiveGuessHost &&
          isUsableForCompany(naiveGuessHost, params.companyName) &&
          hits.some((hit) => domainFromWebsite(hit.url) === naiveGuessHost)
        ) {
          const accepted = await acceptIfLive(
            {
              domain: naiveGuessHost,
              website: officialWebsiteForDomain(naiveGuessHost, `https://www.${naiveGuessHost}`, params.companyName),
              source: "tavily",
            },
            params.companyName,
          );
          if (accepted) return accepted;
        }
      }
    } catch (e) {
      console.warn("[resolveCompanyDomain] Tavily domain search failed", e);
    }
  }

  return { domain: undefined, website: undefined, source: "unresolved" };
}

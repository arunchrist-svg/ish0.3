import { normalizeCompanyName } from "@/lib/enrichment/company-name-match";
import { usableStoredDomain } from "@/lib/enrichment/company-domain-quality";

export type AccountMatchShape = {
  name: string;
  city?: string | null;
  domain?: string | null;
};

export function normalizeScoutCity(city?: string | null): string {
  return (city ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Stable key for in-batch dedupe: domain, else name+city. */
export function scoutAccountDedupeKey(company: AccountMatchShape): string {
  const domain = usableStoredDomain(company.domain, company.name);
  if (domain) return `d:${domain}`;
  const name = normalizeCompanyName(company.name);
  const city = normalizeScoutCity(company.city);
  return city ? `nc:${name}|${city}` : `n:${name}`;
}

export function uniqueScoutCompanies<T extends AccountMatchShape>(companies: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const company of companies) {
    if (!company.name?.trim()) continue;
    const key = scoutAccountDedupeKey(company);
    if (!key || key === "n:" || seen.has(key)) continue;
    seen.add(key);
    out.push(company);
  }
  return out;
}

export function pickMatchingAccount<T extends AccountMatchShape>(
  candidates: T[],
  incoming: AccountMatchShape,
): T | undefined {
  const incomingDomain = usableStoredDomain(incoming.domain, incoming.name);
  if (incomingDomain) {
    const byDomain = candidates.find(
      (candidate) => usableStoredDomain(candidate.domain, candidate.name) === incomingDomain,
    );
    if (byDomain) return byDomain;
  }

  const incomingName = normalizeCompanyName(incoming.name);
  if (!incomingName) return undefined;

  const nameMatches = candidates.filter(
    (candidate) => normalizeCompanyName(candidate.name) === incomingName,
  );
  if (!nameMatches.length) return undefined;

  const incomingCity = normalizeScoutCity(incoming.city);
  if (incomingCity) {
    const cityMatch = nameMatches.find(
      (candidate) => normalizeScoutCity(candidate.city) === incomingCity,
    );
    if (cityMatch) return cityMatch;
    return nameMatches.find((candidate) => !normalizeScoutCity(candidate.city));
  }

  return nameMatches[0];
}

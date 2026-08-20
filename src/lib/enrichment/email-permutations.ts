import {
  isAcceptableCompanyDomain,
  isUnusableCompanyDomain,
  normalizeHost,
} from "@/lib/enrichment/company-domain-quality";
import { knownDomainForCompanyName } from "@/lib/company-logo";
import { domainFromCompany, domainFromWebsite, parseName } from "@/lib/enrichment/provider-utils";

export type EmailPermutation = {
  email: string;
  pattern: string;
  localPart: string;
};

const HOSTNAME_RE =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

export function normalizeNamePart(value?: string | null): string {
  if (!value?.trim()) return "";
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/** Strip protocol, www, paths, query, and ports. Reject empty or non-hostname values. */
export function normalizeDomain(domain?: string | null): string | undefined {
  if (!domain?.trim()) return undefined;
  const cleaned = domain.trim().toLowerCase().replace(/^@+/, "");
  if (!cleaned || cleaned.includes("@") || /\s/.test(cleaned)) return undefined;
  const host = normalizeHost(cleaned)?.split(":")[0]?.replace(/\.+$/, "");
  if (!host || !HOSTNAME_RE.test(host)) return undefined;
  const tld = host.split(".").pop() ?? "";
  if (tld.length < 2 || /^\d+$/.test(tld)) return undefined;
  return host;
}

export function resolveAccountDomain(input: {
  domain?: string | null;
  website?: string | null;
  companyName?: string | null;
}): string | undefined {
  const companyName = input.companyName ?? undefined;
  const known = normalizeDomain(knownDomainForCompanyName(companyName));
  const naiveGuess = companyName?.trim() ? domainFromCompany(companyName) : undefined;

  const fromDomain = normalizeDomain(input.domain);
  if (fromDomain && isAcceptableCompanyDomain(fromDomain, companyName)) {
    // Curated corporate domains beat slug guesses like carborundumuniversal.com
    if (known && naiveGuess && fromDomain === naiveGuess && known !== naiveGuess) return known;
    return fromDomain;
  }

  const fromWebsite = domainFromWebsite(input.website ?? undefined);
  if (fromWebsite && isAcceptableCompanyDomain(fromWebsite, companyName)) {
    if (known && naiveGuess && fromWebsite === naiveGuess && known !== naiveGuess) return known;
    return fromWebsite;
  }

  if (known && isAcceptableCompanyDomain(known, companyName)) return known;

  if (!companyName?.trim()) return undefined;
  return naiveGuess && isAcceptableCompanyDomain(naiveGuess, companyName) ? naiveGuess : undefined;
}

export function resolveContactName(input: {
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
}): { firstName: string; lastName: string } {
  const first = input.firstName?.trim() ?? "";
  const last = input.lastName?.trim() ?? "";
  if (first || last) {
    return { firstName: first, lastName: last };
  }
  return parseName(input.name ?? "");
}

function buildLocalParts(first: string, last: string): { pattern: string; localPart: string }[] {
  const f = normalizeNamePart(first);
  const l = normalizeNamePart(last);
  const out: { pattern: string; localPart: string }[] = [];

  const add = (pattern: string, localPart: string) => {
    if (!localPart) return;
    out.push({ pattern, localPart });
  };

  if (f && l) {
    add("first.last", `${f}.${l}`);
    add("firstlast", `${f}${l}`);
    add("flast", `${f[0]}${l}`);
    add("f.last", `${f[0]}.${l}`);
    add("first", f);
    add("last.first", `${l}.${f}`);
    add("first_last", `${f}_${l}`);
    add("last", l);
  } else if (f) {
    add("first", f);
  } else if (l) {
    add("last", l);
  }

  return out;
}

export function generateEmailPermutations(input: {
  firstName?: string | null;
  lastName?: string | null;
  domain: string;
}): EmailPermutation[] {
  const domain = normalizeDomain(input.domain);
  if (!domain) return [];

  const firstName = input.firstName?.trim() ?? "";
  const lastName = input.lastName?.trim() ?? "";
  const localParts = buildLocalParts(firstName, lastName);
  const seen = new Set<string>();
  const out: EmailPermutation[] = [];

  for (const { pattern, localPart } of localParts) {
    const email = `${localPart}@${domain}`;
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ email, pattern, localPart });
  }

  return out;
}

export function remapSelectedEmails(
  selected: string[],
  suggestions: EmailPermutation[],
): string[] {
  if (!suggestions.length) return [];
  const exact = new Map(suggestions.map((item) => [item.email.toLowerCase(), item.email]));
  const byLocal = new Map(suggestions.map((item) => [item.localPart.toLowerCase(), item.email]));
  const out: string[] = [];
  const seen = new Set<string>();
  for (const email of selected) {
    const local = email.split("@")[0]?.toLowerCase() ?? "";
    const next = exact.get(email.trim().toLowerCase()) ?? byLocal.get(local);
    if (!next) continue;
    const key = next.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(next);
  }
  return out;
}

/** Rebuild guesses when the user edits DOMAIN in Suggest emails. */
export function suggestionsAfterDomainChange(input: {
  firstName?: string | null;
  lastName?: string | null;
  domain: string;
  selected: string[];
  primaryEmail?: string;
}): {
  domain: string | undefined;
  suggestions: EmailPermutation[];
  selected: string[];
  primaryEmail: string;
} {
  const domain = normalizeDomain(input.domain);
  if (!domain || isUnusableCompanyDomain(domain)) {
    return { domain: undefined, suggestions: [], selected: [], primaryEmail: "" };
  }

  const suggestions = generateEmailPermutations({
    firstName: input.firstName,
    lastName: input.lastName,
    domain,
  });
  if (!suggestions.length) {
    return { domain, suggestions, selected: [], primaryEmail: "" };
  }

  const selected = remapSelectedEmails(input.selected, suggestions);
  const fallback = suggestions[0]?.email;
  if (!fallback) {
    return { domain, suggestions: [], selected: [], primaryEmail: "" };
  }
  const nextSelected = selected.length ? selected : [fallback];
  const primaryMapped = input.primaryEmail
    ? remapSelectedEmails([input.primaryEmail], suggestions)[0]
    : undefined;
  const primaryEmail =
    primaryMapped && nextSelected.includes(primaryMapped) ? primaryMapped : nextSelected[0] ?? fallback;
  return { domain, suggestions, selected: nextSelected, primaryEmail };
}

export function generateEmailPermutationsForContact(input: {
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
  domain?: string | null;
  website?: string | null;
  companyName?: string | null;
}): { domain: string; firstName: string; lastName: string; suggestions: EmailPermutation[] } | { error: string } {
  const domain = resolveAccountDomain({
    domain: input.domain,
    website: input.website,
    companyName: input.companyName,
  });
  if (!domain) {
    return { error: "Could not resolve company domain. Add a website or domain on the account." };
  }

  const { firstName, lastName } = resolveContactName(input);
  if (!firstName && !lastName) {
    return { error: "Contact name is required to suggest email patterns." };
  }

  const suggestions = generateEmailPermutations({ firstName, lastName, domain });
  if (!suggestions.length) {
    return { error: "No email patterns could be generated from the contact name." };
  }

  return { domain, firstName, lastName, suggestions };
}

export function isValidPermutationForContact(
  email: string,
  input: {
    firstName?: string | null;
    lastName?: string | null;
    name?: string | null;
    domain?: string | null;
    website?: string | null;
    companyName?: string | null;
  },
): boolean {
  const result = generateEmailPermutationsForContact(input);
  if ("error" in result) return false;
  const key = email.trim().toLowerCase();
  return result.suggestions.some((s) => s.email.toLowerCase() === key);
}

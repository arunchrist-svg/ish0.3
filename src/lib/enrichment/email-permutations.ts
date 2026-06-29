import { domainFromCompany, domainFromWebsite, parseName } from "@/lib/enrichment/provider-utils";

export type EmailPermutation = {
  email: string;
  pattern: string;
  localPart: string;
};

export function normalizeNamePart(value?: string | null): string {
  if (!value?.trim()) return "";
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export function normalizeDomain(domain?: string | null): string | undefined {
  if (!domain?.trim()) return undefined;
  const cleaned = domain.trim().toLowerCase().replace(/^@+/, "");
  if (!cleaned || cleaned.includes("@")) return undefined;
  return cleaned.replace(/^www\./, "");
}

export function resolveAccountDomain(input: {
  domain?: string | null;
  website?: string | null;
  companyName?: string | null;
}): string | undefined {
  return (
    normalizeDomain(input.domain) ??
    domainFromWebsite(input.website ?? undefined) ??
    (input.companyName?.trim() ? domainFromCompany(input.companyName) : undefined)
  );
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

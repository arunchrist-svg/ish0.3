import { linkedInSlug, normalizeEmail, normalizeLinkedInUrl } from "@/lib/utils";

export type ContactLike = {
  id: string;
  name: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  linkedIn?: string | null;
  title?: string | null;
};

export type ConnectionLike = {
  id: string;
  firstName: string;
  lastName: string;
  linkedInUrl: string;
  email?: string | null;
  company?: string | null;
};

export type MatchResult = {
  contactId: string;
  method: "url" | "email" | "fuzzy";
  confidence: number;
};

function normalizeName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function namesMatch(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (na === nb) return true;
  const partsA = na.split(" ");
  const partsB = nb.split(" ");
  return partsA[0] === partsB[0] && partsA[partsA.length - 1] === partsB[partsB.length - 1];
}

function companyMatches(connectionCompany: string | null | undefined, accountName: string): boolean {
  if (!connectionCompany?.trim()) return false;
  const c = connectionCompany.trim().toLowerCase();
  const a = accountName.trim().toLowerCase();
  return c.includes(a) || a.includes(c) || c.split(/\s+/)[0] === a.split(/\s+/)[0];
}

export function matchConnectionToContact(
  connection: ConnectionLike,
  contact: ContactLike,
  accountName?: string,
): MatchResult | null {
  const connSlug = linkedInSlug(connection.linkedInUrl);
  const contactSlug = linkedInSlug(contact.linkedIn);
  if (connSlug && contactSlug && connSlug === contactSlug) {
    return { contactId: contact.id, method: "url", confidence: 100 };
  }

  const connEmail = normalizeEmail(connection.email);
  const contactEmail = normalizeEmail(contact.email);
  if (connEmail && contactEmail && connEmail === contactEmail) {
    return { contactId: contact.id, method: "email", confidence: 90 };
  }

  const connName = `${connection.firstName} ${connection.lastName}`.trim();
  if (namesMatch(connName, contact.name) && accountName && companyMatches(connection.company, accountName)) {
    return { contactId: contact.id, method: "fuzzy", confidence: 70 };
  }

  return null;
}

export function connectionAtAccount(
  connection: ConnectionLike,
  accountName: string,
): boolean {
  return companyMatches(connection.company, accountName);
}

export function normalizeConnectionUrl(url: string): string {
  return normalizeLinkedInUrl(url) ?? url.trim();
}

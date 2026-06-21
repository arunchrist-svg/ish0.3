import { normalizeLinkedInUrl } from "@/lib/utils";

export function parseName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

export function linkedinHandle(url?: string): string | undefined {
  const normalized = normalizeLinkedInUrl(url);
  if (!normalized) return undefined;
  try {
    const path = new URL(normalized).pathname.replace(/^\/+|\/+$/g, "");
    const match = path.match(/^(?:in\/)?([^/?#]+)/i);
    return match?.[1];
  } catch {
    return undefined;
  }
}

export function domainFromWebsite(websiteUrl?: string): string | undefined {
  if (!websiteUrl?.trim()) return undefined;
  try {
    const host = new URL(
      websiteUrl.startsWith("http") ? websiteUrl : `https://${websiteUrl}`,
    ).hostname;
    return host.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

export function domainFromCompany(company: string): string {
  const normalized = company
    .toLowerCase()
    .replace(/\s*(pvt\.?\s*ltd\.?|private|limited|llp|inc\.?|corp\.?|plc)\s*/gi, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
  return `${normalized}.com`;
}

export function resolveDomain(input: { company: string; websiteUrl?: string }): string | undefined {
  return domainFromWebsite(input.websiteUrl) ?? domainFromCompany(input.company);
}

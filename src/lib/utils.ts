import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Normalize LinkedIn profile URLs from mixed formats (path-only, full URL, regional subdomain). */
export function normalizeLinkedInUrl(raw?: string | null): string | undefined {
  if (!raw) return undefined;

  let url = raw.trim();
  if (!url) return undefined;

  url = url.replace(/^https?:\/\/https?:\/\//i, "https://");

  if (/^https?:\/\//i.test(url)) {
    return url;
  }

  url = url.replace(/^\/+/, "");

  if (/^[\w-]+\.linkedin\.com/i.test(url) || /^linkedin\.com/i.test(url)) {
    return `https://${url}`;
  }

  if (/^in\//i.test(url)) {
    return `https://www.linkedin.com/${url}`;
  }

  return `https://${url}`;
}

/** Extract lowercase LinkedIn /in/ slug for matching. */
export function linkedInSlug(raw?: string | null): string | undefined {
  const normalized = normalizeLinkedInUrl(raw);
  if (!normalized) return undefined;
  const match = normalized.match(/linkedin\.com\/in\/([^/?#]+)/i);
  return match ? decodeURIComponent(match[1]).toLowerCase() : undefined;
}

/** Normalize email for case-insensitive matching. */
export function normalizeEmail(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim().toLowerCase();
  return trimmed.includes("@") ? trimmed : undefined;
}

const BLANK_PERSON_FIELD = /^(?:[-–—]|n\/?a|unknown|null|undefined)$/i;

/** True when a person field is empty or a dash placeholder. */
export function isBlankPersonField(value?: string | null): boolean {
  if (value == null) return true;
  const trimmed = value.trim();
  return !trimmed || BLANK_PERSON_FIELD.test(trimmed);
}

export function personFieldOrEmpty(value?: string | null): string {
  return isBlankPersonField(value) ? "" : value!.trim();
}

export function displayPersonTitle(title?: string | null): string {
  return isBlankPersonField(title) ? "Title not listed" : title!.trim();
}

/** Profile URL when we have one, otherwise LinkedIn people search for this name and company. */
export function personLinkedInHref(input: {
  linkedIn?: string | null;
  name: string;
  companyName?: string;
}): { href: string; hasProfile: boolean } {
  const profile = normalizeLinkedInUrl(input.linkedIn);
  if (profile) return { href: profile, hasProfile: true };
  const keywords = [input.name, input.companyName].filter((part) => part?.trim()).join(" ");
  return {
    href: `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(keywords)}`,
    hasProfile: false,
  };
}

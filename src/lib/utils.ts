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

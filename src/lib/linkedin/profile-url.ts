import { normalizeLinkedInUrl } from "@/lib/utils";

/** Empty clears. Invalid profile URLs throw. */
export function parseTeamLinkedIn(raw?: string | null): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const normalized = normalizeLinkedInUrl(trimmed);
  if (!normalized || !/linkedin\.com\/in\//i.test(normalized)) {
    throw new Error("Enter a LinkedIn profile URL (linkedin.com/in/...)");
  }
  return normalized;
}

function normalizeAppUrl(url: string): string {
  return url.replace(/\/$/, "");
}

function isLocalhostUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
  } catch {
    return true;
  }
}

/** Base URL for in-app navigation and tracking. May be localhost in local dev. */
export function getAppUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.APP_URL?.trim();
  if (fromEnv) return normalizeAppUrl(fromEnv);
  if (process.env.VERCEL_URL) return normalizeAppUrl(`https://${process.env.VERCEL_URL}`);
  return normalizeAppUrl(`http://localhost:${process.env.PORT ?? 3002}`);
}

/**
 * Base URL for links shared outside the app (invites, billing redirects, etc.).
 * Never returns localhost — set APP_URL to your deployed HTTPS URL when developing locally.
 */
export function getShareableAppUrl(): string {
  const candidates = [
    process.env.APP_URL?.trim(),
    process.env.NEXT_PUBLIC_APP_URL?.trim(),
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined,
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (!isLocalhostUrl(candidate)) return normalizeAppUrl(candidate);
  }

  throw new Error(
    "Public app URL required for invite links. Set APP_URL (recommended) or NEXT_PUBLIC_APP_URL to your deployed HTTPS URL, e.g. https://your-app.vercel.app",
  );
}

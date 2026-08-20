/** Full navigation so Capacitor WebView commits session cookies before the next request. */
export function completeLoginRedirect(destination: string): void {
  const path = destination.startsWith("/") ? destination : `/${destination}`;
  window.location.assign(path);
}

/** Allow only in-app paths (blocks protocol-relative and open-redirect URLs). */
export function safeInternalNextPath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (!raw.startsWith("/")) return null;
  if (raw.startsWith("//") || raw.startsWith("/\\")) return null;
  if (raw.includes("://") || raw.includes("\\")) return null;
  return raw;
}

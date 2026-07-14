/** Full navigation so Capacitor WebView commits session cookies before the next request. */
export function completeLoginRedirect(destination: string): void {
  const path = destination.startsWith("/") ? destination : `/${destination}`;
  window.location.assign(path);
}

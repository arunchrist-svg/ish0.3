/**
 * Open tracking is a 1x1 pixel. Mail scanners, image proxies, and security
 * gateways often fetch it without a human reading the message. Gmail unread
 * state is independent of pixel hits.
 */

/** Ignore pixel hits this soon after send (delivery-time scanners). */
export const OPEN_TRACKING_GRACE_MS = 60_000;

/**
 * Obvious non-human fetchers. Do NOT block GoogleImageProxy / ApplePrivacy:
 * real Gmail and Apple Mail opens also use those proxies.
 */
const BOT_UA_RE =
  /(?:^|[^a-z])(?:bot|crawler|spider|scrapy|curl\/|wget\/|python-requests|go-http-client|java\/|libwww|httpclient|http\.rb|okhttp|scanner|urlscan|virustotal|proofpoint|mimecast|barracuda|messagelabs|fireeye|symantec|trendmicro|bitdefender|spamassassin|mailer-daemon|uptimerobot|pingdom|statuscake|headlesschrome|phantomjs|selenium)(?:[^a-z]|$)/i;

export type OpenTrackingDecision =
  | { accept: true }
  | { accept: false; reason: "missing_send" | "not_sent" | "within_grace" | "bot_ua" | "own_origin" };

export function isLikelyNonHumanOpenUserAgent(userAgent: string | null | undefined): boolean {
  const ua = userAgent?.trim();
  if (!ua) return false;
  return BOT_UA_RE.test(ua);
}

export function isOpenFromOwnAppOrigin(
  referer: string | null | undefined,
  appUrl: string | null | undefined,
): boolean {
  const ref = referer?.trim();
  const app = appUrl?.trim();
  if (!ref || !app) return false;
  try {
    const refererOrigin = new URL(ref).origin;
    const appOrigin = new URL(app).origin;
    return refererOrigin === appOrigin;
  } catch {
    return false;
  }
}

/**
 * Decide whether a pixel hit should mark the outreach row as opened.
 * Prefer fewer false "Opened" over catching every true immediate open.
 */
export function shouldRecordEmailOpen(params: {
  sentAt: Date | null | undefined;
  status: string | null | undefined;
  now?: Date;
  userAgent?: string | null;
  referer?: string | null;
  appUrl?: string | null;
  graceMs?: number;
}): OpenTrackingDecision {
  if (!params.sentAt) return { accept: false, reason: "missing_send" };
  if (params.status !== "sent") return { accept: false, reason: "not_sent" };

  if (isOpenFromOwnAppOrigin(params.referer, params.appUrl)) {
    return { accept: false, reason: "own_origin" };
  }

  if (isLikelyNonHumanOpenUserAgent(params.userAgent)) {
    return { accept: false, reason: "bot_ua" };
  }

  const now = params.now ?? new Date();
  const graceMs = params.graceMs ?? OPEN_TRACKING_GRACE_MS;
  const elapsed = now.getTime() - params.sentAt.getTime();
  if (elapsed < graceMs) {
    return { accept: false, reason: "within_grace" };
  }

  return { accept: true };
}

const NO_STORE_CACHE_CONTROL = "no-store, no-cache, must-revalidate, private";

/**
 * Response cache headers for the tracking pixel GIF.
 *
 * Grace-window hits must not be cached forever: if a delivery scanner fetches
 * the pixel once and the proxy keeps that response, a later real open never
 * re-hits our server (so Opened stays blank after we ignore the early hit).
 * Use a short max-age that expires when grace ends so proxies re-fetch after.
 * All other responses use no-store.
 */
export function openTrackingPixelCacheHeaders(params: {
  decision?: OpenTrackingDecision | null;
  sentAt?: Date | null;
  now?: Date;
  graceMs?: number;
}): Record<string, string> {
  const now = params.now ?? new Date();
  const graceMs = params.graceMs ?? OPEN_TRACKING_GRACE_MS;

  if (
    params.decision &&
    !params.decision.accept &&
    params.decision.reason === "within_grace" &&
    params.sentAt
  ) {
    const remainingMs = Math.max(0, graceMs - (now.getTime() - params.sentAt.getTime()));
    const maxAgeSec = Math.max(1, Math.ceil(remainingMs / 1000));
    const expiresAt = new Date(now.getTime() + maxAgeSec * 1000);
    return {
      "Cache-Control": `private, max-age=${maxAgeSec}, must-revalidate`,
      Pragma: "no-cache",
      Expires: expiresAt.toUTCString(),
    };
  }

  return {
    "Cache-Control": NO_STORE_CACHE_CONTROL,
    Pragma: "no-cache",
    Expires: "0",
  };
}

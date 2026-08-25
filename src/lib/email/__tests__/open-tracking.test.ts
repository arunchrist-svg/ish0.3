import { describe, expect, it } from "vitest";
import {
  OPEN_TRACKING_GRACE_MS,
  isLikelyNonHumanOpenUserAgent,
  isOpenFromOwnAppOrigin,
  openTrackingPixelCacheHeaders,
  shouldRecordEmailOpen,
} from "@/lib/email/open-tracking";

describe("shouldRecordEmailOpen", () => {
  const sentAt = new Date("2026-08-25T02:10:21.907Z");

  it("rejects hits before the email was sent", () => {
    expect(
      shouldRecordEmailOpen({ sentAt: null, status: "sent" }),
    ).toEqual({ accept: false, reason: "missing_send" });
  });

  it("rejects hits on non-sent rows", () => {
    expect(
      shouldRecordEmailOpen({ sentAt, status: "scheduled" }),
    ).toEqual({ accept: false, reason: "not_sent" });
  });

  it("rejects the Moneyview-style delivery scanner hit (~8s after send)", () => {
    const now = new Date(sentAt.getTime() + 7_690);
    expect(
      shouldRecordEmailOpen({ sentAt, status: "sent", now }),
    ).toEqual({ accept: false, reason: "within_grace" });
  });

  it("rejects hits just inside the grace window", () => {
    const now = new Date(sentAt.getTime() + OPEN_TRACKING_GRACE_MS - 1);
    expect(
      shouldRecordEmailOpen({ sentAt, status: "sent", now }),
    ).toEqual({ accept: false, reason: "within_grace" });
  });

  it("accepts hits after the grace window", () => {
    const now = new Date(sentAt.getTime() + OPEN_TRACKING_GRACE_MS);
    expect(
      shouldRecordEmailOpen({ sentAt, status: "sent", now }),
    ).toEqual({ accept: true });
  });

  it("rejects known bot user agents even after grace", () => {
    const now = new Date(sentAt.getTime() + OPEN_TRACKING_GRACE_MS + 1_000);
    expect(
      shouldRecordEmailOpen({
        sentAt,
        status: "sent",
        now,
        userAgent: "python-requests/2.31.0",
      }),
    ).toEqual({ accept: false, reason: "bot_ua" });
  });

  it("still accepts Gmail image proxy after grace (real opens use it)", () => {
    const now = new Date(sentAt.getTime() + OPEN_TRACKING_GRACE_MS + 1_000);
    expect(
      shouldRecordEmailOpen({
        sentAt,
        status: "sent",
        now,
        userAgent: "Mozilla/5.0 (Windows NT 5.1; rv:11.0) Gecko Firefox/11.0 (via ggpht.com GoogleImageProxy)",
      }),
    ).toEqual({ accept: true });
  });

  it("rejects pixel loads from our own app origin (HTML preview)", () => {
    const now = new Date(sentAt.getTime() + OPEN_TRACKING_GRACE_MS + 1_000);
    expect(
      shouldRecordEmailOpen({
        sentAt,
        status: "sent",
        now,
        referer: "https://app.example.com/email",
        appUrl: "https://app.example.com",
      }),
    ).toEqual({ accept: false, reason: "own_origin" });
  });
});

describe("isLikelyNonHumanOpenUserAgent", () => {
  it("flags scanners and scripted clients", () => {
    expect(isLikelyNonHumanOpenUserAgent("curl/8.0")).toBe(true);
    expect(isLikelyNonHumanOpenUserAgent("Proofpoint Email Protection")).toBe(true);
  });

  it("does not flag empty or normal browser UAs", () => {
    expect(isLikelyNonHumanOpenUserAgent(null)).toBe(false);
    expect(isLikelyNonHumanOpenUserAgent("Mozilla/5.0 (Macintosh) Chrome/120")).toBe(false);
  });
});

describe("isOpenFromOwnAppOrigin", () => {
  it("matches same origin only", () => {
    expect(isOpenFromOwnAppOrigin("https://app.example.com/x", "https://app.example.com")).toBe(true);
    expect(isOpenFromOwnAppOrigin("https://mail.google.com/", "https://app.example.com")).toBe(false);
  });
});

describe("openTrackingPixelCacheHeaders", () => {
  const sentAt = new Date("2026-08-25T02:10:21.907Z");

  it("uses short max-age for grace-window ignores so proxies re-fetch after grace", () => {
    const now = new Date(sentAt.getTime() + 7_690);
    const headers = openTrackingPixelCacheHeaders({
      decision: { accept: false, reason: "within_grace" },
      sentAt,
      now,
    });
    const remainingSec = Math.ceil((OPEN_TRACKING_GRACE_MS - 7_690) / 1000);
    expect(headers["Cache-Control"]).toBe(`private, max-age=${remainingSec}, must-revalidate`);
    expect(headers.Pragma).toBe("no-cache");
    expect(headers.Expires).toBe(new Date(now.getTime() + remainingSec * 1000).toUTCString());
  });

  it("uses no-store for accepted opens and non-grace ignores", () => {
    const now = new Date(sentAt.getTime() + OPEN_TRACKING_GRACE_MS + 1_000);
    expect(
      openTrackingPixelCacheHeaders({
        decision: { accept: true },
        sentAt,
        now,
      }),
    ).toEqual({
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
      Pragma: "no-cache",
      Expires: "0",
    });
    expect(
      openTrackingPixelCacheHeaders({
        decision: { accept: false, reason: "bot_ua" },
        sentAt,
        now,
      })["Cache-Control"],
    ).toContain("no-store");
  });

  it("defaults to no-store when there is no decision (already opened / missing token)", () => {
    expect(openTrackingPixelCacheHeaders({})["Cache-Control"]).toContain("no-store");
    expect(openTrackingPixelCacheHeaders({}).Expires).toBe("0");
  });
});
